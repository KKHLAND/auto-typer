// AI 없이 동작하는 규칙 기반 파서: 텍스트(복붙·txt·md·hwpx 본문·PDF 텍스트층) → 블록
// 내용은 고치지 않는다. 줄의 모양(마크다운 표기, 목록 기호, 표 구분선, 빈 줄)만 보고 종류를 나눈다.
import { LIST_RE } from './hwpx.js';

// 표 칸 안의 줄바꿈 자리표시 (칸을 나눈 뒤 '\n' 으로 바꾼다)
const CELL_BR = '\u0001';

/** HTML <table> → 마크다운 표 줄 (합친 칸은 왼쪽·위 칸에 글자, 1칸짜리 표는 인용 상자로) */
function htmlTables(text) {
  return text.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (_, body) => {
    const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((tr) =>
      [...tr[1].matchAll(/<t([hd])\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) =>
        c[2].replace(/<br\s*\/?>/gi, CELL_BR).replace(/<(?!\/?(u|b|strong)\b)[^>]+>/gi, '').replace(/\|/g, '｜').trim(),
      ),
    ).filter((r) => r.length && r.some((c) => c.trim()));
    if (!rows.length) return '\n';
    const cells = rows.flat().filter((c) => c.trim());
    if (cells.length === 1) return `\n\n${cells[0].split(CELL_BR).map((l) => `> ${l}`).join('\n')}\n\n`;
    const w = Math.max(...rows.map((r) => r.length));
    return `\n\n${rows.map((r) => `| ${[...r, ...Array(w - r.length).fill('')].join(' | ')} |`).join('\n')}\n\n`;
  });
}

/** 마크다운·HTML 흔적을 내부 표기로 (kordoc 같은 문서→마크다운 변환기 출력도 그대로 받는다) */
export function normalizeMarkdown(text) {
  let s = String(text).replace(/\r\n?/g, '\n');
  s = htmlTables(s);
  return s
    .split('\n')
    .map((line) => {
      if (/^\s*!\[[^\]]*\]\([^)]*\)\s*$/.test(line)) return ''; // 그림 자리표시
      let l = line
        .replace(/\\\|/g, '｜') // 칸 나눔이 아닌 세로줄
        .replace(/\\([\\`*_{}[\]()#+\-.!~<>$])/g, '$1') // 마크다운 이스케이프 풀기 (\$40 → $40, 수식 판정은 markup.js 규칙이 맡는다)
        .replace(/<u>([\s\S]*?)<\/u>/gi, '__$1__')
        .replace(/<b>([\s\S]*?)<\/b>|<strong>([\s\S]*?)<\/strong>/gi, (_, a, b) => `**${a ?? b}**`);
      // 표 줄 안의 <br> 은 칸 안 줄바꿈, 그 밖은 문단 나눔
      l = l.replace(/<br\s*\/?>/gi, /^\s*\|/.test(l) ? CELL_BR : '\n');
      // 남은 서식용 HTML 태그는 글자만 남긴다 (<보기> 같은 꺾쇠 글은 건드리지 않음)
      return l.replace(/<\/?(?:sup|sub|span|div|p|i|em|small|mark|font|a|thead|tbody|colgroup|col)\b[^>]*>/gi, '');
    })
    .join('\n');
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
      table.rows.push(t.replace(/^\||\|$/g, '').split('|').map((c) => c.trim().split(CELL_BR).map((x) => x.trim()).join('\n')));
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
      // "- ① …" 처럼 이미 번호·기호가 있으면 그대로, 없을 때만 '•'
      const body = m[2].trim();
      para = { type: 'list', level: indentLevel(m[1] + ' '), text: LIST_RE.test(body) ? body : `• ${body}` };
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
