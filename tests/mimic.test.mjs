// 원본 모양 따라 만들기 · 올린 양식 그대로 내용 넣기 · 1단 기본 양식
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { unzipSync } from 'fflate';
import { loadHwpx, buildHwpx, analyzeTemplate, collectHeaderTexts } from '../src/engine/hwpx.js';
import { specFromText, buildMimicTemplate, specSummary } from '../src/engine/mimic.js';
import { findContentAnchor } from '../src/engine/form.js';
import { sampleDoc } from '../src/sampleDoc.js';

mkdirSync('tests/out', { recursive: true });
let fail = 0;
const check = (ok, msg) => {
  if (!ok) {
    console.error('FAIL', msg);
    fail++;
  }
};
const dec = (b) => new TextDecoder().decode(b);
const validXml = (bytes, label) => {
  const files = unzipSync(bytes);
  check(Object.keys(files)[0] === 'mimetype', `${label}: mimetype 맨 앞`);
  for (const n of Object.keys(files).filter((n) => /\.(xml|hpf)$/.test(n))) {
    const errs = [];
    new DOMParser({ onError: (lvl, msg) => lvl !== 'warning' && errs.push(msg) }).parseFromString(dec(files[n]), 'text/xml');
    check(!errs.length, `${label}: ${n} XML 오류 ${errs[0]}`);
  }
  return dec(files['Contents/section0.xml']);
};

// ── 1) 글자 위치로 모양 읽기: A4(595×842pt) 2단, 머리 줄 3칸, 아래 '- 1 -'
{
  const W = 595, H = 842;
  const items = [
    { s: '○○고등학교', x: 45, y: 60, w: 70, h: 12 },
    { s: '2026 1학기 영어 학습지', x: 220, y: 62, w: 160, h: 18 },
    { s: '2학년 (  )반', x: 480, y: 60, w: 70, h: 10 },
    { s: '- 1 -', x: 290, y: 815, w: 18, h: 9 },
  ];
  for (let k = 0; k < 40; k++) {
    items.push({ s: '본문 글줄 '.repeat(4), x: 45, y: 110 + k * 16, w: 240, h: 10 });
    items.push({ s: '오른쪽 단 글줄 '.repeat(3), x: 310, y: 110 + k * 16, w: 240, h: 10 });
  }
  const spec = specFromText(items, W, H);
  check(spec.paperMm.w === 210 && spec.paperMm.h === 297, `용지 A4 (${JSON.stringify(spec.paperMm)})`);
  check(spec.columns === 2, '2단');
  check(spec.bodyPt === 10, `본문 10pt (${spec.bodyPt})`);
  check(spec.footer.pageNumber === 'dash', '쪽 번호 - n -');
  check(spec.header.cells.length === 3 && spec.header.cells[1].align === 'center' && /영어 학습지/.test(spec.header.cells[1].text), `머리 3칸 ${JSON.stringify(spec.header.cells)}`);
  check(spec.marginsMm.left >= 14 && spec.marginsMm.left <= 17, `왼쪽 여백 ${spec.marginsMm.left}mm`);
  console.log('spec:', specSummary(spec));

  const sample = loadHwpx(readFileSync('public/templates/sample.hwpx'));
  const sampleA = JSON.parse(readFileSync('public/templates/sample.profile.json', 'utf8'));
  const built = buildMimicTemplate(sample, sampleA, spec);
  const tsec = validXml(built.bytes, '모양 양식');
  check(/colCount="2"/.test(tsec), '양식 2단');
  check(tsec.includes('2026 1학기 영어 학습지') && tsec.includes('2학년 (  )반'), '머리 칸 글자');
  check(/colCnt="3"/.test(tsec), '머리 표 3칸');
  check(built.head.cells.every((c) => c.i >= 0), '미리보기 칸 위치');
  const out = buildHwpx(loadHwpx(built.bytes), sampleDoc(), { analysis: built.analysis });
  writeFileSync('tests/out/mimic-sample.hwpx', out);
  validXml(out, '모양 양식 + 내용');

  // 1단 · 머리 없음 · 쪽 번호 없음 · 쪽 테두리
  const b2 = buildMimicTemplate(sample, sampleA, { paperMm: { w: 257, h: 364 }, columns: 1, header: { cells: [] }, footer: { pageNumber: 'none' }, pageBorder: true, bodyPt: 11 });
  const s2 = validXml(b2.bytes, 'B4 1단');
  check(/colCount="1"/.test(s2) && !/<hp:header /.test(s2) && !/<hp:footer /.test(s2) && /width="72851"/.test(s2), 'B4 1단 머리·꼬리 없음');
  check(b2.analysis.css.body.size === 11, `본문 11pt (${b2.analysis.css.body.size})`);
}

// ── 2) 올린 양식 그대로 + 내용 넣기
{
  const form = loadHwpx(readFileSync('tests/forms/수행평가_답안지.hwpx'));
  const analysis = analyzeTemplate(form);
  const doc = { title: '정리', blocks: [{ id: 'a', type: 'paragraph', text: '새로 넣은 내용 문단입니다.' }] };
  const sec = validXml(buildHwpx(form, doc, { analysis, keepBody: true }), '양식 그대로');
  check(sec.includes('2026학년도 1학기 영어Ⅰ') && sec.includes('curious') && sec.includes('새로 넣은 내용 문단'), '양식 글·표가 남고 내용이 들어감');

  // {{내용}} 표시가 있으면 그 자리에
  const marked = { files: { ...form.files } };
  const s0 = dec(form.files['Contents/section0.xml']);
  marked.files['Contents/section0.xml'] = new TextEncoder().encode(
    s0.replace('<hp:t>3. 다음 낱말의 뜻을 우리말로 쓰시오. (각 2점)</hp:t>', '<hp:t>{{내용}}</hp:t>'),
  );
  const a = findContentAnchor(dec(marked.files['Contents/section0.xml']), analysis.geometry);
  check(a.how === 'mark', `내용 표시 찾음 (${a.how})`);
  const ms = validXml(buildHwpx(marked, doc, { analysis, keepBody: true }), '내용 표시');
  check(!ms.includes('{{내용}}') && ms.indexOf('새로 넣은 내용') < ms.indexOf('curious'), '표시 자리에 내용');
}

// ── 3) 기본 양식2 = 기본 양식1 을 1단으로 (머리 표·쪽 번호 같음, 학번·이름 칸 없음, 쪽 테두리 없음)
{
  const tpl = loadHwpx(readFileSync('public/templates/plain.hwpx'));
  const analysis = JSON.parse(readFileSync('public/templates/plain.profile.json', 'utf8'));
  const ht = collectHeaderTexts(tpl);
  check(ht.map((h) => h.text).join('|') === '- | -|○○고등학교|학습 자료명', `머리 문구 ${ht.map((h) => h.text)}`);
  check(analysis.geometry.cols === 1, '1단');
  const bytes = buildHwpx(tpl, sampleDoc(), { analysis, headerEdits: { [ht[2].key]: '원묵고등학교', [ht[3].key]: '관계대명사' } });
  writeFileSync('tests/out/plain-sample.hwpx', bytes);
  const sec = validXml(bytes, '1단 양식');
  check(sec.includes('원묵고등학교') && sec.includes('관계대명사') && /colCount="1"/.test(sec) && !sec.includes('학번'), '1단 양식 머리 표·1단');
}
// 기본 양식1: 학번·이름 칸이 없다
check(!collectHeaderTexts(loadHwpx(readFileSync('public/templates/sample.hwpx'))).some((h) => /학번|이름/.test(h.text)), '기본 양식1 학번·이름 칸 없음');

console.log(fail ? `${fail} failed` : 'mimic ok');
process.exit(fail ? 1 : 0);
