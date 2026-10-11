// 시험용 '채움 양식' 만들기: 학교에서 흔히 쓰는 서술형 수행평가 답안지 모양
//   - 학번·이름 칸(표의 빈 칸), 문항 아래 빈 줄, 답 상자(1칸 표), 단어 뜻 표, 채점 기준 표(점수 칸), 밑줄 친 빈 줄
// 사용: node tools/make-form-fixture.mjs  → tests/forms/수행평가_답안지.hwpx
// 실제 학생 정보는 들어 있지 않다(내용은 모두 지어낸 것).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadHwpx, readText, savePackage, HeaderEditor, topLevelParas, esc } from '../src/engine/hwpx.js';

const pkg = loadHwpx(readFileSync('public/templates/sample.hwpx'));
const hdr = new HeaderEditor(readText(pkg, 'Contents/header.xml'));
let sec = readText(pkg, 'Contents/section0.xml');

// 1단, 머리말(머리 표) 없음 — 보통의 답안지 모양
sec = sec.replace(/(<hp:colPr\b[^>]*\bcolCount=")\d+"/, '$11"');
sec = sec.replace(/<hp:ctrl><hp:header\b[\s\S]*?<\/hp:header><\/hp:ctrl>/, '');
const { paras } = topLevelParas(sec);
const [s0, e0] = paras[0];
const p0 = sec.slice(s0, e0);

const BODY_PP = '1';
const BODY_CP = '15';
const pp = hdr.paraPr(BODY_PP, { noHeading: true, intent: 0, left: 0 });
const ppCenter = hdr.paraPr(BODY_PP, { noHeading: true, intent: 0, left: 0, align: 'CENTER' });
const ppCell = hdr.paraPr(BODY_PP, { noHeading: true, intent: 0, left: 0, align: 'LEFT', prev: 0, next: 0 });
const cpTitle = hdr.charPr(BODY_CP, { b: true, size: 1600 });
const cpBold = hdr.charPr(BODY_CP, { b: true });
const cpUnder = hdr.charPr(BODY_CP, { u: true });
const bf = hdr.boxBorder();

let oid = 1500000000;
const P = (text, { para = pp, cp = BODY_CP } = {}) =>
  `<hp:p id="0" paraPrIDRef="${para}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${cp}">${text ? `<hp:t>${esc(text)}</hp:t>` : '<hp:t/>'}</hp:run></hp:p>`;
const blank = () => P('');

/** rows: [[{t, w, b}]] (w=HWPUNIT), h=행 높이 */
function table(rows, heights) {
  const W = rows[0].reduce((a, c) => a + c.w, 0);
  const H = heights.reduce((a, b) => a + b, 0);
  const trs = rows
    .map((r, ri) => {
      let col = 0;
      return `<hp:tr>${r
        .map((c) => {
          const x =
            `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${bf}">` +
            `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${c.top ? 'TOP' : 'CENTER'}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">` +
            P(c.t || '', { para: c.center ? ppCenter : ppCell, cp: c.b ? cpBold : BODY_CP }) +
            `</hp:subList><hp:cellAddr colAddr="${col}" rowAddr="${ri}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${c.w}" height="${heights[ri]}"/>` +
            `<hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>`;
          col++;
          return x;
        })
        .join('')}</hp:tr>`;
    })
    .join('');
  const tbl =
    `<hp:tbl id="${oid++}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${rows.length}" colCnt="${rows[0].length}" cellSpacing="0" borderFillIDRef="${bf}" noAdjust="0">` +
    `<hp:sz width="${W}" widthRelTo="ABSOLUTE" height="${H}" heightRelTo="ABSOLUTE" protect="0"/>` +
    `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
    `<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>${trs}</hp:tbl>`;
  return `<hp:p id="0" paraPrIDRef="${ppCenter}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${BODY_CP}">${tbl}<hp:t/></hp:run></hp:p>`;
}

const FULL = 50000;
const body = [
  P('2026학년도 1학기 영어Ⅰ 서술형 수행평가 답안지', { para: ppCenter, cp: cpTitle }),
  blank(),
  table(
    [[{ t: '학번', w: 8000, b: true, center: true }, { w: 17000 }, { t: '이름', w: 8000, b: true, center: true }, { w: 17000 }]],
    [2400],
  ),
  blank(),
  P('1. 다음 글을 읽고, 글쓴이의 주장을 우리말로 한 문장으로 쓰시오. (5점)', { cp: cpBold }),
  P('Reading every day helps us think more deeply and understand other people better.'),
  blank(),
  blank(),
  blank(),
  blank(),
  P('2. 자신이 가장 좋아하는 계절과 그 이유를 영어로 3문장 이상 쓰시오. (10점)', { cp: cpBold }),
  table([[{ w: FULL, top: true }]], [14000]),
  blank(),
  P('3. 다음 낱말의 뜻을 우리말로 쓰시오. (각 2점)', { cp: cpBold }),
  table(
    [
      [{ t: '낱말', w: 15000, b: true, center: true }, { t: '뜻', w: 25000, b: true, center: true }, { t: '점수', w: 10000, b: true, center: true }],
      [{ t: 'curious', w: 15000, center: true }, { w: 25000 }, { w: 10000 }],
      [{ t: 'journey', w: 15000, center: true }, { w: 25000 }, { w: 10000 }],
    ],
    [2000, 2400, 2400],
  ),
  blank(),
  P('4. 이번 활동에서 새로 배운 점을 자유롭게 쓰시오.', { cp: cpBold }),
  P('                                                                                    ', { cp: cpUnder }),
  P('                                                                                    ', { cp: cpUnder }),
  P('                                                                                    ', { cp: cpUnder }),
].join('');

sec = sec.slice(0, s0) + p0 + body + '</hs:sec>';
pkg.files['Contents/section0.xml'] = new TextEncoder().encode(sec);
pkg.files['Contents/header.xml'] = new TextEncoder().encode(hdr.xml);
mkdirSync('tests/forms', { recursive: true });
writeFileSync('tests/forms/수행평가_답안지.hwpx', savePackage(pkg));
console.log('tests/forms/수행평가_답안지.hwpx');
