// AI 없이 동작하는 규칙 기반 파서: 텍스트(복붙·txt·md·hwpx 본문·PDF 텍스트층) → 블록
// 내용은 고치지 않는다. 줄의 모양(마크다운 표기, 목록 기호, 표 구분선, 빈 줄)만 보고 종류를 나눈다.
import { LIST_RE } from './hwpx.js';

/** 마크다운·HTML 흔적을 내부 표기로 */
export function normalizeMarkdown(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/<u>([\s\S]*?)<\/u>/gi, '__$1__')
    .replace(/<b>([\s\S]*?)<\/b>|<strong>([\s\S]*?)<\/strong>/gi, (_, a, b) => `**${a ?? b}**`)
    .replace(/<br\s*\/?>/gi, '\n');
}

const HEADING_RE = /^\s*(#{1,3})\s+(.+)$/;
const ROMAN_HEAD = /^\s*(?:[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]\s*[.．]|제\s*\d+\s*(?:장|단원|과|절)|\d+\s*(?:장|단원|과)\b|[■◆●▣]\s|【[^】]+】)/;
const BOX_HEAD = /^\s*[<〈＜《\[]\s*(보\s*기|참\s*고|요\s*약|핵\s*심|정\s*리|tip)\s*[>〉＞》\]]\s*$/i;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const MD_BULLET = /^(\s*)[-*+]\s+(.*)$/;

const indentLevel = (raw) => {
  const lead = /^[ \t　]*/.exec(raw)[0].replace(/\t/g, '    ').replace(/　/g, '  ').length;
  return Math.min(3, 1 + Math.floor(lead / 2));
};

export function parseText(raw) {
  const lines = normalizeMarkdown(raw).split('\n');
  const blocks = [];
  let para = null; // 이어 붙이는 중인 문단·목록·상자 블록
  let table = null;
  let box = null;

  const flushPara = () => {
    if (para && para.text.trim()) blocks.push(para);
    para = null;
  };
  const flushTable = () => {
    if (table?.rows.length) blocks.push(table);
    table = null;
  };
  const flushBox = () => {
    if (box && (box.text.trim() || box.title)) blocks.push(box);
    box = null;
  };
  const flushAll = () => {
    flushPara();
    flushTable();
    flushBox();
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    const t = line.trim();

    // 표 (마크다운 | a | b |)
    if (TABLE_ROW.test(line)) {
      flushPara();
      flushBox();
      if (TABLE_SEP.test(line)) continue;
      table ??= { type: 'table', rows: [] };
      table.rows.push(t.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      continue;
    }
    if (table) flushTable();

    if (!t) {
      flushPara();
      flushBox(); // 빈 줄이 상자를 닫는다
      continue;
    }

    // 상자: <보기> 같은 제목 줄 또는 인용(>)
    if (BOX_HEAD.test(t)) {
      flushAll();
      box = { type: 'box', title: t, text: '' };
      continue;
    }
    if (/^>\s?/.test(t)) {
      flushPara();
      if (!box) box = { type: 'box', title: '', text: '' };
      box.text += (box.text ? '\n' : '') + t.replace(/^>\s?/, '');
      continue;
    }
    if (box) {
      box.text += (box.text ? '\n' : '') + t;
      continue;
    }

    // 소제목
    let m;
    if ((m = HEADING_RE.exec(t))) {
      flushPara();
      const level = m[1].length;
      blocks.push({ type: !blocks.length && level === 1 ? 'title' : 'heading', level, text: m[2].trim() });
      continue;
    }
    if (ROMAN_HEAD.test(t) && t.length <= 40 && !/[.?!。]$/.test(t)) {
      flushPara();
      blocks.push({ type: 'heading', level: 1, text: t });
      continue;
    }

    // 목록: 마크다운 글머리(- * +)는 '•' 로, 그 밖의 번호·기호는 원문 그대로
    if ((m = MD_BULLET.exec(line)) && !/^\s*-{3,}\s*$/.test(line)) {
      flushPara();
      para = { type: 'list', level: indentLevel(m[1] + ' '), text: `• ${m[2].trim()}` };
      continue;
    }
    if (LIST_RE.test(t)) {
      flushPara();
      para = { type: 'list', level: indentLevel(line), text: t };
      continue;
    }

    // 문단: 줄바꿈으로 끊긴 줄은 이어 붙인다 (빈 줄이 문단을 나눈다)
    if (para) {
      const joinNoSpace = /[-­]$/.test(para.text) && /^[a-z]/.test(t);
      para.text = joinNoSpace ? para.text.replace(/[-­]$/, '') + t : `${para.text} ${t}`;
    } else {
      para = { type: 'paragraph', text: t };
    }
  }
  flushAll();
  return blocks;
}
