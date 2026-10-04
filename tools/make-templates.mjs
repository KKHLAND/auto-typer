// 내장 샘플 양식 만들기
// 원본: tools/sample-source.hwpx — 선생님이 한글에서 직접 다듬은 A4 2단 학습지
//   머리 표·바닥글·쪽 설정은 그대로 두고, 본문 문단에서 역할별 서식을 정해 담은 뒤 본문 내용은 비운다.
// 사용: npm run templates
import { readFileSync, writeFileSync } from 'node:fs';
import { loadHwpx, readText, analyzeTemplate, buildHwpx, collectHeaderTexts, topLevelParas, roleCss, tText } from '../src/engine/hwpx.js';

const SRC = 'tools/sample-source.hwpx';
const OUT = 'sample';

const src = loadHwpx(readFileSync(SRC));
const analysis = analyzeTemplate(src);
const sec = readText(src, 'Contents/section0.xml');
const header = readText(src, 'Contents/header.xml');

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
