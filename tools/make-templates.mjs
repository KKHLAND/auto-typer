// 내장 샘플 양식 만들기
// 원본: tools/sample-source.hwpx — 선생님이 한글에서 직접 다듬은 A4 2단 학습지
//   머리 표·바닥글·쪽 설정은 그대로 두고, 본문 문단에서 역할별 서식을 정해 담은 뒤 본문 내용은 비운다.
// 사용: npm run templates
import { readFileSync, writeFileSync } from 'node:fs';
import { loadHwpx, readText, analyzeTemplate, buildHwpx, collectHeaderTexts, topLevelParas, roleCss, tText, HeaderEditor } from '../src/engine/hwpx.js';

const SRC = 'tools/sample-source.hwpx';
const OUT = 'sample';

const src = loadHwpx(readFileSync(SRC));
repeatHeadTable(src);
const analysis = analyzeTemplate(src);
const sec = readText(src, 'Contents/section0.xml');
const header = readText(src, 'Contents/header.xml');

/**
 * 원본의 머리 표(학교명·학습 자료명·학번·이름)는 첫 문단에 떠 있어 1쪽에만 나온다.
 * 이 표를 머리말(hp:header, 양쪽)로 옮겨 모든 쪽에 되풀이되게 한다.
 * 첫 쪽 모양은 그대로: 원래 표는 '위쪽 여백 + 머리말' 아래에서 시작했으므로
 * 새 위쪽 여백 = 원래 위쪽 + 원래 머리말, 새 머리말 = 표 높이 + 표 아래 여백.
 */
function repeatHeadTable(pkg) {
  const enc = new TextEncoder();
  let s = readText(pkg, 'Contents/section0.xml');
  const [p0s, p0e] = topLevelParas(s).paras[0];
  let p0 = s.slice(p0s, p0e);
  if (/<hp:header\b/.test(p0)) return; // 이미 머리말에 있음
  const tbl = /<hp:tbl\b[\s\S]*?<\/hp:tbl>/.exec(p0);
  if (!tbl) throw new Error('원본 첫 문단에 머리 표가 없습니다');
  const width = +/<hp:sz width="(\d+)"/.exec(tbl[0])[1];
  const height = +/<hp:sz [^>]*height="(\d+)"/.exec(tbl[0])[1];
  const gap = +(/<hp:outMargin [^>]*bottom="(\d+)"/.exec(tbl[0])?.[1] ?? 0);
  // 머리말 안에서는 글자처럼 취급(줄 하나 = 표). 표 아래 바깥 여백은 그대로 두어 본문과 띄운다
  const inline = tbl[0].replace(/<hp:pos treatAsChar="0"/, '<hp:pos treatAsChar="1"');
  // 줄 간격 100% 인 왼쪽 정렬 문단 (머리 표 왼쪽 칸 문단 서식에서 파생)
  const he = new HeaderEditor(readText(pkg, 'Contents/header.xml'));
  const leftPara = /<hp:tc\b[\s\S]*?<hp:p [^>]*paraPrIDRef="(\d+)"/.exec(tbl[0])[1];
  const pp = he.paraPr(leftPara, { align: 'LEFT', line: 100 });
  pkg.files['Contents/header.xml'] = enc.encode(he.xml);
  const headCtrl =
    `<hp:ctrl><hp:header id="2" applyPageType="BOTH"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" ` +
    `linkListIDRef="0" linkListNextIDRef="0" textWidth="${width}" textHeight="${height + gap}" hasTextRef="0" hasNumRef="0">` +
    `<hp:p id="0" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${/<hp:run charPrIDRef="(\d+)"/.exec(p0)[1]}">${inline}<hp:t/></hp:run></hp:p>` +
    `</hp:subList></hp:header></hp:ctrl>`;
  p0 = p0.replace(tbl[0], headCtrl);
  // 여백: 머리 표가 원래 자리(위쪽+머리말)에서 시작하도록
  p0 = p0.replace(/<hp:margin ([^>]*)\/>/, (all, a) => {
    const v = (k) => +new RegExp(`\\b${k}="(\\d+)"`).exec(a)[1];
    const top = v('top') + v('header');
    return all.replace(/\bheader="\d+"/, `header="${height + gap}"`).replace(/\btop="\d+"/, `top="${top}"`);
  });
  s = s.slice(0, p0s) + p0 + s.slice(p0e);
  pkg.files['Contents/section0.xml'] = enc.encode(s);
}

/** 글자가 text 로 시작하는 본문 문단의 {paraPr, style, charPr} */
function styleOf(text) {
  for (const [s, e] of topLevelParas(sec).paras.slice(1)) {
    const p = sec.slice(s, e);
    const t = [...p.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)].map((m) => tText(m[1])).join('');
    if (!t.trim().startsWith(text)) continue;
    const open = /<hp:p\b[^>]*>/.exec(p)[0];
    return {
      paraPr: /paraPrIDRef="(\d+)"/.exec(open)[1],
      style: /styleIDRef="(\d+)"/.exec(open)[1],
      charPr: /<hp:run charPrIDRef="(\d+)"/.exec(p)[1],
    };
  }
  throw new Error(`원본에서 "${text}" 문단을 찾지 못했습니다`);
}

// 선생님이 정한 서식 → 역할
//   본문: 지문 문단 / 목록 1단계: 번호 달린 문항 줄(내어쓰기) / 목록 2단계: ① 선지 줄
analysis.profile.body = styleOf('Reading is not');
analysis.profile.list = styleOf('2. 윗글의');
analysis.profile.list2 = styleOf('① 기억은');
analysis.css = roleCss(header, analysis.profile);

const ht = collectHeaderTexts(src);
const titleKey = ht[3]?.key; // [쪽앞, 쪽뒤, 학교명, 학습 자료명, 학번·이름]
const bytes = buildHwpx(src, { title: '', blocks: [] }, { analysis, headerEdits: titleKey ? { [titleKey]: '학습 자료명' } : {} });
const final = loadHwpx(bytes);
analysis.headerTexts = collectHeaderTexts(final);
writeFileSync(`public/templates/${OUT}.hwpx`, bytes);
writeFileSync(`public/templates/${OUT}.profile.json`, JSON.stringify(analysis, null, 2));
console.log(OUT, bytes.length, 'bytes');
console.log(' profile', JSON.stringify(analysis.profile));
console.log(' css body', JSON.stringify(analysis.css.body), '\n css list', JSON.stringify(analysis.css.list), '\n css list2', JSON.stringify(analysis.css.list2));
console.log(' header', analysis.headerTexts.map((h) => h.text));
