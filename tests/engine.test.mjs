import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { unzipSync } from 'fflate';
import { loadHwpx, buildHwpx, analyzeTemplate, collectHeaderTexts } from '../src/engine/hwpx.js';
import { sampleDoc } from '../src/sampleDoc.js';

mkdirSync('tests/out', { recursive: true });
let fail = 0;
for (const id of ['sample']) {
  const tpl = loadHwpx(readFileSync(`public/templates/${id}.hwpx`));
  const analysis = JSON.parse(readFileSync(`public/templates/${id}.profile.json`, 'utf8'));
  const ht = collectHeaderTexts(tpl);
  const edits = { [ht[2].key]: '원묵고등학교', [ht[3].key]: '관계대명사 한눈에 정리' };
  const bytes = buildHwpx(tpl, sampleDoc(), { analysis, headerEdits: edits });
  writeFileSync(`tests/out/${id}-sample.hwpx`, bytes);
  const files = unzipSync(bytes);
  const names = Object.keys(files);
  if (names[0] !== 'mimetype') { console.error('mimetype not first'); fail++; }
  for (const n of names.filter((n) => /\.(xml|hpf)$/.test(n))) {
    const errs = [];
    new DOMParser({ onError: (lvl, msg) => { if (lvl !== 'warning') errs.push(msg); } }).parseFromString(new TextDecoder().decode(files[n]), 'text/xml');
    if (errs.length) { console.error(id, n, errs.slice(0, 3)); fail++; }
  }
  const sec = new TextDecoder().decode(files['Contents/section0.xml']);
  console.log(id, bytes.length, 'bytes, paras', (sec.match(/<hp:p /g) || []).length, 'edited header ok:', sec.includes('관계대명사 한눈에 정리') && sec.includes('원묵고등학교'));
  // 생성물을 다시 분석해도 같은 역할로 읽히는지
  const re = analyzeTemplate(loadHwpx(bytes));
  console.log('  re-analysis stats', re.stats);

  // 샘플 양식의 머리 표는 머리말에 있어 쪽마다 되풀이된다
  if (!/<hp:header\b[\s\S]*?<hp:tbl\b[\s\S]*?<\/hp:header>/.test(sec)) { console.error(id, '머리 표가 머리말에 없음'); fail++; }
  // 양식 원본의 문서 정보가 남지 않는다
  const hpf = new TextDecoder().decode(files['Contents/content.hpf']);
  if (/name="(?:creator|lastsaveby)"[^>]*>[^<]+</.test(hpf)) { console.error(id, '문서 정보가 남음'); fail++; }
}

// 구역이 둘 이상인 양식: 둘째 구역부터(원래 내용)는 버린다
{
  const tpl = loadHwpx(readFileSync('public/templates/sample.hwpx'));
  const dec = (k) => new TextDecoder().decode(tpl.files[k]);
  const enc = (s) => new TextEncoder().encode(s);
  tpl.files['Contents/section1.xml'] = enc(dec('Contents/section0.xml').replace('</hs:sec>', '<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:t>예전 내용</hp:t></hp:run></hp:p></hs:sec>'));
  tpl.files['Contents/content.hpf'] = enc(dec('Contents/content.hpf')
    .replace(/(<opf:item id="section0"[^>]*\/>)/, '$1<opf:item id="section1" href="Contents/section1.xml" media-type="application/xml"/>')
    .replace(/(<opf:itemref idref="section0"[^>]*\/>)/, '$1<opf:itemref idref="section1" linear="yes"/>'));
  tpl.files['Contents/header.xml'] = enc(dec('Contents/header.xml').replace('secCnt="1"', 'secCnt="2"'));
  const files = unzipSync(buildHwpx(tpl, sampleDoc(), { analysis: JSON.parse(readFileSync('public/templates/sample.profile.json', 'utf8')) }));
  const hpf = new TextDecoder().decode(files['Contents/content.hpf']);
  const ok = !files['Contents/section1.xml'] && !/section1/.test(hpf) && /secCnt="1"/.test(new TextDecoder().decode(files['Contents/header.xml']));
  console.log('multi-section template cleaned:', ok);
  if (!ok) fail++;
}
process.exit(fail ? 1 : 0);
