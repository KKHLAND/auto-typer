// 내장 샘플 양식 만들기: 수능 2단 서식(글꼴·본문·목록 서식)을 바탕으로 한 A4 2단 학습지
//   머리: [학교명] [학습 자료명] [학번·이름]  — 교시·홀수형·영역 같은 시험 문구는 넣지 않는다
// 사용: npm run templates   (상위 폴더 cowork/ 의 원본 샘플 hwpx 가 필요)
import { readFileSync, writeFileSync } from 'node:fs';
import {
  loadHwpx, readText, analyzeTemplate, buildHwpx, HeaderEditor, geometry, collectHeaderTexts, topLevelParas, esc,
} from '../src/engine/hwpx.js';

const SRC = '../2024학년도 수능국어 문제지.hwpx';
const OUT = 'sample';

// A4 (HWPUNIT, 1mm ≈ 283.46)
const PAGE = { width: 59528, height: 84188 };
const M = { left: 4252, right: 4252, top: 4252, bottom: 4252, header: 2835, footer: 2835 };
const BODY_W = PAGE.width - M.left - M.right; // 51024
const COL_GAP = 1700;

const src = loadHwpx(readFileSync(SRC));
const learned = analyzeTemplate(src); // 원본 본문에서 서식을 먼저 배운다
const B = learned.profile.body;

const hdr = new HeaderEditor(readText(src, 'Contents/header.xml'));
const addBorderFill = (sides) => {
  const id = String(hdr.maxId('borderFill') + 1);
  const line = (n) => `<hh:${n}Border type="${sides[n] ? 'SOLID' : 'NONE'}" width="${sides[n] || '0.1 mm'}" color="#000000"/>`;
  hdr.append(
    'borderFills',
    'borderFill',
    `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">` +
      `<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>` +
      line('left') + line('right') + line('top') + line('bottom') +
      `<hh:diagonal type="NONE" width="0.1 mm" color="#000000"/></hh:borderFill>`,
  );
  return id;
};
const bfNone = addBorderFill({});
const bfRule = addBorderFill({ bottom: '0.7 mm' });

const cp = {
  school: hdr.charPr(B.charPr, { b: true, size: 1200 }),
  title: hdr.charPr(B.charPr, { b: true, size: 1600 }),
  id: hdr.charPr(B.charPr, { size: 1000 }),
  page: hdr.charPr(B.charPr, { size: 900 }),
};
const pp = (align) => hdr.paraPr(B.paraPr, { align, intent: 0, left: 0, prev: 0, next: 0, noHeading: true });
const P = { left: pp('LEFT'), center: pp('CENTER'), right: pp('RIGHT') };

const para = (paraPr, charPr, text) =>
  `<hp:p id="0" paraPrIDRef="${paraPr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${charPr}"><hp:t>${esc(text)}</hp:t></hp:run></hp:p>`;

// 머리 표: 1행 3칸, 아래쪽 굵은 줄 하나
const CW = [9000, BODY_W - 31500, 22500];
const H = 3400;
const cell = (ci, inner) =>
  `<hp:tc name="" header="0" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="${bfRule}">` +
  `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${inner}</hp:subList>` +
  `<hp:cellAddr colAddr="${ci}" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${CW[ci]}" height="${H}"/>` +
  `<hp:cellMargin left="141" right="141" top="141" bottom="283"/></hp:tc>`;
const headTable =
  `<hp:tbl id="1900000001" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="NONE" repeatHeader="0" rowCnt="1" colCnt="3" cellSpacing="0" borderFillIDRef="${bfNone}" noAdjust="0">` +
  `<hp:sz width="${BODY_W}" widthRelTo="ABSOLUTE" height="${H}" heightRelTo="ABSOLUTE" protect="0"/>` +
  `<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="1" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
  `<hp:outMargin left="0" right="0" top="0" bottom="1134"/><hp:inMargin left="141" right="141" top="141" bottom="141"/>` +
  `<hp:tr>${cell(0, para(P.left, cp.school, '○○고등학교'))}${cell(1, para(P.center, cp.title, '학습 자료명'))}${cell(2, para(P.right, cp.id, '학번 (             )  이름 (                 )'))}</hp:tr></hp:tbl>`;

// 구역 설정: 원본 secPr 을 A4 로
const sec0 = readText(src, 'Contents/section0.xml');
let secPr = /<hp:secPr[\s\S]*?<\/hp:secPr>/.exec(sec0)[0];
secPr = secPr
  .replace(/<hp:pagePr [^>]*>/, `<hp:pagePr landscape="WIDELY" width="${PAGE.width}" height="${PAGE.height}" gutterType="LEFT_ONLY">`)
  .replace(/<hp:margin [^>]*\/>/, `<hp:margin header="${M.header}" footer="${M.footer}" gutter="0" left="${M.left}" right="${M.right}" top="${M.top}" bottom="${M.bottom}"/>`)
  .replace(/<hp:presentation[\s\S]*?<\/hp:presentation>/, '');
const colPr = `<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="2" sameSz="1" sameGap="${COL_GAP}"><hp:colLine type="SOLID" width="0.12 mm" color="#000000"/></hp:colPr></hp:ctrl>`;
const footer =
  `<hp:ctrl><hp:footer id="1" applyPageType="BOTH"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="BOTTOM" linkListIDRef="0" linkListNextIDRef="0" textWidth="${BODY_W}" textHeight="${M.footer}" hasTextRef="0" hasNumRef="0">` +
  `<hp:p id="0" paraPrIDRef="${P.center}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${cp.page}"><hp:t>- </hp:t>` +
  `<hp:ctrl><hp:autoNum num="1" numType="PAGE"><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar="" supscript="0"/></hp:autoNum></hp:ctrl><hp:t> -</hp:t></hp:run></hp:p>` +
  `</hp:subList></hp:footer></hp:ctrl>`;
const p0 =
  `<hp:p id="0" paraPrIDRef="${P.left}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">` +
  `<hp:run charPrIDRef="${B.charPr}">${secPr}${colPr}${footer}</hp:run>` +
  `<hp:run charPrIDRef="${B.charPr}">${headTable}<hp:t/></hp:run></hp:p>`;

const [s0] = topLevelParas(sec0).paras[0];
const newSec = sec0.slice(0, s0) + p0 + '</hs:sec>';
const pkg = { files: { ...src.files } };
pkg.files['Contents/section0.xml'] = new TextEncoder().encode(newSec);
pkg.files['Contents/header.xml'] = new TextEncoder().encode(hdr.xml);

// 배운 서식 + 새 쪽 형상 → 빈 본문으로 저장 (안 쓰는 그림·썸네일 정리)
const analysis = { ...learned, geometry: geometry(newSec), headerTexts: collectHeaderTexts(pkg) };
const bytes = buildHwpx(pkg, { title: '', blocks: [] }, { analysis });
const final = loadHwpx(bytes);
analysis.headerTexts = collectHeaderTexts(final);
writeFileSync(`public/templates/${OUT}.hwpx`, bytes);
writeFileSync(`public/templates/${OUT}.profile.json`, JSON.stringify(analysis, null, 2));
console.log(OUT, bytes.length, 'bytes', analysis.geometry, analysis.headerTexts.map((h) => h.text));
