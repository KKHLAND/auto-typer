// 채움 양식 엔진 — 선생님이 올린 답안지·활동지 양식의 '빈 칸'에 학생이 쓴 내용을 채워 넣는다.
//
// 흐름(학습자료 정리)과 달리 양식은 한 글자도 바꾸지 않고 그대로 두고:
//   1) 양식에서 채울 자리(slot)를 찾는다 (detectSlots)
//        field  누름틀·메일 머지 필드 ({{학번}} 등)
//        cell   표의 빈 칸 (왼쪽·위 칸의 글자가 칸 이름: 학번 | □ )
//        lines  문항 아래의 빈 줄·밑줄 줄 (2줄 이상, 또는 밑줄 친 줄)
//   2) 학생(기록) 한 명마다 양식 전체를 한 부씩 복사해 자리를 채우고, 부마다 새 쪽에서 시작한다 (buildFilledHwpx)
// 자리의 위치는 양식 XML 의 문단 순번으로 기억한다 — 같은 양식 파일이면 언제나 같은 순번이다.

import { readText, savePackage, tText, esc, fieldRanges, HeaderEditor, inlineRuns, topLevelParas, geometry } from './hwpx.js';
import { paragraphs, plain } from './markup.js';

const OBJ = /^(tbl|pic|rect|ellipse|line|arc|polygon|curve|connectLine|container|equation|ole|textart|video|chart)$/;
const SKIP_CTX = /^(header|footer|footNote|endNote|masterPage)$/;

/**
 * 구역 XML → 문단·표·칸 나무
 * paras[i] = {i, start, openEnd, end, container, text, hasObj, cp, field}
 * containers[id] = {id, kind:'top'|'cell'|'box'|'skip', cell, paras:[i]}
 * cells = {tbl, row, col, colSpan, rowSpan, w, container}, tables = {i, para, cells}
 */
export function parseForm(sec) {
  const paras = [];
  const containers = [{ id: 0, kind: 'top', cell: null, paras: [] }];
  const cells = [];
  const tables = [];
  const pStack = [];
  const cStack = [0];
  const cellStack = [];
  const tblStack = [];
  const skipStack = []; // 머리말·꼬리말·각주 안
  let pendingCell = null;
  const re =
    /<(\/?)hp:(p|subList|tc|tbl|run|t|cellAddr|cellSpan|cellSz|fieldBegin|header|footer|footNote|endNote|pic|rect|ellipse|line|arc|polygon|curve|connectLine|container|equation|ole|textart|video|chart)(?=[\s>/])([^>]*?)(\/?)>/g;
  const secOpen = sec.indexOf('>', sec.indexOf('<hs:sec')) + 1;
  re.lastIndex = secOpen;
  let m;
  while ((m = re.exec(sec))) {
    const [tag, close, name, attrs, self] = m;
    const top = pStack[pStack.length - 1];
    const P = top != null ? paras[top] : null;
    if (SKIP_CTX.test(name)) {
      if (self) continue;
      if (close) skipStack.pop();
      else skipStack.push(name);
      continue;
    }
    switch (name) {
      case 'p': {
        if (close) {
          const i = pStack.pop();
          paras[i].end = re.lastIndex;
        } else if (!self) {
          const c = cStack[cStack.length - 1];
          const i = paras.length;
          paras.push({ i, start: m.index, openEnd: re.lastIndex, end: -1, container: c, text: '', hasObj: false, cp: null, field: false, parent: top ?? null });
          containers[c].paras.push(i);
          pStack.push(i);
        }
        break;
      }
      case 'subList': {
        if (self) break;
        if (close) {
          cStack.pop();
          break;
        }
        const id = containers.length;
        const kind = skipStack.length ? 'skip' : pendingCell ? 'cell' : 'box';
        containers.push({ id, kind, cell: pendingCell, paras: [] });
        if (pendingCell) pendingCell.container = id;
        pendingCell = null;
        cStack.push(id);
        break;
      }
      case 'tc': {
        if (close) cellStack.pop();
        else {
          const t = tblStack[tblStack.length - 1];
          const cell = { tbl: t, row: 0, col: 0, colSpan: 1, rowSpan: 1, w: 0, container: null };
          cells.push(cell);
          if (t != null) tables[t].cells.push(cell);
          cellStack.push(cell);
          pendingCell = skipStack.length ? null : cell;
        }
        break;
      }
      case 'cellAddr': {
        const c = cellStack[cellStack.length - 1];
        if (c) {
          c.col = +(/colAddr="(\d+)"/.exec(attrs)?.[1] ?? 0);
          c.row = +(/rowAddr="(\d+)"/.exec(attrs)?.[1] ?? 0);
        }
        break;
      }
      case 'cellSpan': {
        const c = cellStack[cellStack.length - 1];
        if (c) {
          c.colSpan = +(/colSpan="(\d+)"/.exec(attrs)?.[1] ?? 1);
          c.rowSpan = +(/rowSpan="(\d+)"/.exec(attrs)?.[1] ?? 1);
        }
        break;
      }
      case 'cellSz': {
        const c = cellStack[cellStack.length - 1];
        if (c) c.w = +(/width="(\d+)"/.exec(attrs)?.[1] ?? 0);
        break;
      }
      case 'tbl': {
        if (close) tblStack.pop();
        else if (!self) {
          if (P) P.hasObj = true;
          tblStack.push(tables.length);
          tables.push({ i: tables.length, para: top ?? null, cells: [], skip: skipStack.length > 0 });
        }
        break;
      }
      case 'run': {
        if (!close && P && P.cp == null) P.cp = /charPrIDRef="(\d+)"/.exec(attrs)?.[1] ?? null;
        break;
      }
      case 't': {
        if (close || self || !P) break;
        const endT = sec.indexOf('</hp:t>', re.lastIndex);
        P.text += tText(sec.slice(re.lastIndex, endT));
        re.lastIndex = endT + 7;
        break;
      }
      case 'fieldBegin': {
        if (!close && P) P.field = true;
        break;
      }
      default:
        if (!close && OBJ.test(name) && P) P.hasObj = true;
    }
  }
  return { secOpen, paras, containers, cells, tables };
}

const QUESTION = /^\s*(?:\d{1,2}\s*[.)]|\(\d{1,2}\)|[①-⑳]|문항\s*\d|\[[^\]]{0,10}\d+\]|[<〈][^>〉]{0,10}[>〉])/;
// 선생님이 채우는 칸(점수·채점·확인·서명 등)은 처음엔 채우지 않는다
export const TEACHER_LABEL = /점수|채점|배점|득점|총점|평가|확인|서명|감독|교사|선생님|비고/;
const isBlankText =(t) => !String(t).replace(/[\s_＿　·.…-]/g, '');
const RULE_TEXT = /_{5,}|＿{3,}|\.{8,}|…{4,}/;

function underlineSet(header) {
  const s = new Set();
  for (const m of header.matchAll(/<hh:charPr id="(\d+)"[\s\S]*?<\/hh:charPr>/g)) {
    if (/<hh:underline type="(BOTTOM|CENTER)"/.test(m[0])) s.add(m[1]);
  }
  return s;
}

const short = (t, n = 60) => {
  const s = String(t).replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

/**
 * 양식의 채울 자리 찾기
 * @returns {Array<{id, kind, label, context, paras?:number[], field?:string, cellPara?:number}>}
 */
export function detectSlots(pkg) {
  const sec = readText(pkg, 'Contents/section0.xml');
  const header = readText(pkg, 'Contents/header.xml');
  const F = parseForm(sec);
  const ul = underlineSet(header);
  const out = [];
  const usable = (p) => F.containers[p.container].kind !== 'skip';
  const blank = (p) => !p.hasObj && !p.field && isBlankText(p.text);
  const ruled = (p) => !p.hasObj && (RULE_TEXT.test(p.text) || (ul.has(p.cp) && p.text.length >= 8 && !p.text.trim()));

  // 1) 필드
  for (const f of fieldRanges(sec)) {
    const open = /<hp:fieldBegin\b[^>]*>/.exec(sec.slice(f.start))?.[0] || '';
    const type = /\btype="([A-Z_]+)"/.exec(open)?.[1] || '';
    if (type && !/CLICK_HERE|MAILMERGE|MAIL_MERGE/.test(type)) continue;
    const id = /\bid="(\d+)"/.exec(open)?.[1];
    const inner = sec.slice(f.start, f.end);
    const shown = [...inner.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)].map((x) => tText(x[1])).join('');
    const direction = /<hp:stringParam name="Direction">([^<]*)</.exec(inner)?.[1] || '';
    const nameAttr = /\bname="([^"]+)"/.exec(open)?.[1] || '';
    const cmd = f.name && !/[:]/.test(f.name) ? f.name : '';
    const label = (nameAttr || cmd || shown.replace(/[{}]/g, '').trim() || direction || '입력란').trim();
    const para = F.paras.findLast((p) => p.start < f.start && p.end > f.start);
    if (para && !usable(para)) continue;
    out.push({ kind: 'field', field: id, label: short(label, 30), context: para ? short(para.text, 120) : '', pos: f.start });
  }

  // 표 칸 이름: 같은 행 왼쪽의 가장 가까운 글자 칸 · 첫 행(머리 행)의 같은 열 칸
  const cellText = (c) => (c.container != null ? F.containers[c.container].paras.map((i) => F.paras[i].text).join(' ').trim() : '');
  const cellLabel = (c) => {
    const T = F.tables[c.tbl];
    if (!T) return '';
    const left = T.cells
      .filter((x) => x.row <= c.row && x.row + x.rowSpan > c.row && x.col < c.col && cellText(x))
      .sort((a, b) => b.col - a.col)[0];
    const head = c.row > 0 ? T.cells.find((x) => x.row === 0 && x.col <= c.col && x.col + x.colSpan > c.col && cellText(x)) : null;
    const above = !head && c.row > 0
      ? T.cells.filter((x) => x.col === c.col && x.row < c.row && cellText(x)).sort((a, b) => b.row - a.row)[0]
      : null;
    return [left, head || above].filter(Boolean).map((x) => short(cellText(x), 40)).join(' · ');
  };
  // 표 바로 앞의 글(문항 등) — 칸 이름이 없을 때 쓴다
  const beforeTable = (T) => {
    if (T.para == null) return '';
    const host = F.paras[T.para];
    if (host.text.trim()) return host.text;
    const sib = F.containers[host.container].paras;
    for (let k = sib.indexOf(host.i) - 1; k >= 0; k--) {
      const t = F.paras[sib[k]].text.trim();
      if (t) return t;
      if (F.paras[sib[k]].hasObj) break;
    }
    return '';
  };

  // 2) 빈 칸
  const wholeBlankCells = new Set();
  for (const c of F.cells) {
    if (c.container == null) continue;
    const C = F.containers[c.container];
    if (C.kind !== 'cell' || F.tables[c.tbl]?.skip) continue;
    const ps = C.paras.map((i) => F.paras[i]).filter((p) => F.paras[p.i].container === C.id);
    if (!ps.length || !ps.every(blank)) continue;
    wholeBlankCells.add(C.id);
    const T = F.tables[c.tbl];
    let label = cellLabel(c);
    const ctx = beforeTable(T);
    if (!label) label = T.cells.length === 1 ? short(ctx, 50) || '답 칸' : `표 ${T.i + 1}의 ${c.row + 1}행 ${c.col + 1}열`;
    out.push({ kind: 'cell', paras: ps.map((p) => p.i), label, context: short(ctx, 120), w: c.w, pos: ps[0].start });
  }

  // 3) 빈 줄 묶음 (2줄 이상, 또는 밑줄 줄)
  for (const C of F.containers) {
    if (C.kind === 'skip' || wholeBlankCells.has(C.id)) continue;
    const ps = C.paras.map((i) => F.paras[i]);
    for (let k = 0; k < ps.length; ) {
      if (!blank(ps[k])) {
        k++;
        continue;
      }
      let j = k;
      while (j < ps.length && blank(ps[j])) j++;
      const run = ps.slice(k, j);
      const before = ps.slice(0, k).reverse().filter((p) => p.text.trim()).slice(0, 4);
      const prevText = before[0]?.text || '';
      // 칸 이름은 가까운 문항 줄(1. / (1) / ① …)로, 없으면 바로 앞 글로
      const question = before.find((p) => QUESTION.test(p.text))?.text;
      const nextP = ps[j];
      // 문항 아래 답 줄로 볼 수 있는 경우만: 2줄 이상이거나 밑줄 줄, 그리고 앞에 글이 있다(맨 앞 빈 줄은 여백)
      const ok = (run.length >= 2 || run.some(ruled)) && (prevText || C.kind === 'cell') && !(nextP?.hasObj && run.length < 3);
      if (ok) {
        const label = short(question || prevText, 50) || (C.cell ? cellLabel(C.cell) : '') || '답 줄';
        out.push({
          kind: 'lines',
          paras: run.map((p) => p.i),
          label,
          context: short(question && question !== prevText ? `${question} … ${prevText}` : prevText, 200),
          w: C.cell?.w || 0,
          pos: run[0].start,
        });
      }
      k = j;
    }
  }

  out.sort((a, b) => a.pos - b.pos);
  // 같은 이름이 여럿이면 뒤에 번호 (표의 '뜻' 칸이 여러 개일 때 등)
  const seen = new Map();
  for (const s of out) seen.set(s.label, (seen.get(s.label) ?? 0) + 1);
  const n = new Map();
  return out.map((s, k) => {
    const dup = seen.get(s.label) > 1;
    const c = (n.get(s.label) ?? 0) + 1;
    n.set(s.label, c);
    const { pos, ...rest } = s;
    const off = s.kind === 'cell' && TEACHER_LABEL.test(s.label.split(' · ').pop());
    return { id: `s${k + 1}`, ...rest, label: dup ? `${s.label} (${c})` : s.label, ...(off ? { off: true } : {}) };
  });
}

/** 필드 자리 → 그 필드가 든 문단 번호: Map(문단 번호 → [slot]) */
function fieldParas(sec, F, slots) {
  const out = new Map();
  const ranges = fieldRanges(sec);
  for (const s of slots.filter((x) => x.kind === 'field')) {
    const f = ranges.find((r) => (/\bid="(\d+)"/.exec(sec.slice(r.start, r.start + 400))?.[1]) === s.field);
    const p = f && F.paras.findLast((q) => q.start < f.start && q.end > f.start);
    if (p) (out.get(p.i) ?? out.set(p.i, []).get(p.i)).push(s);
  }
  return out;
}

/** 미리보기용: 자리가 시작하는 문단·덮는 문단·필드가 든 문단 */
export function slotLayout(pkg, slots) {
  const sec = readText(pkg, 'Contents/section0.xml');
  const F = parseForm(sec);
  const first = new Map();
  const covered = new Set();
  for (const s of slots) {
    if (s.kind === 'field') continue;
    first.set(s.paras[0], s);
    s.paras.forEach((i) => covered.add(i));
  }
  return { first, covered, fields: fieldParas(sec, F, slots) };
}

/** AI 에게 줄 양식 글:인쇄된 내용 순서대로, 채울 자리는 [[s3: 이름]] */
export function formOutline(pkg, slots) {
  const sec = readText(pkg, 'Contents/section0.xml');
  const F = parseForm(sec);
  const at = new Map(); // 문단 번호 → 표시할 자리
  for (const s of slots) {
    if (s.kind === 'field') continue;
    at.set(s.paras[0], s);
  }
  const fieldsByPara = fieldParas(sec, F, slots);
  const lines = [];
  const tableOf = new Map(F.tables.filter((t) => t.para != null).map((t) => [t.para, t]));
  const mark = (s) => `[[${s.id}: ${s.label}]]`;
  const walk = (cid, indent) => {
    const C = F.containers[cid];
    if (C.kind === 'skip') return;
    for (const i of C.paras) {
      const p = F.paras[i];
      const s = at.get(i);
      if (s) lines.push(indent + mark(s));
      else if (p.text.trim()) {
        const fs = fieldsByPara.get(i);
        lines.push(indent + p.text.trim() + (fs ? ' ' + fs.map(mark).join(' ') : ''));
      }
      const T = tableOf.get(i);
      if (T && !T.skip) {
        const rows = new Map();
        for (const c of T.cells) (rows.get(c.row) ?? rows.set(c.row, []).get(c.row)).push(c);
        lines.push(`${indent}<표>`);
        for (const r of [...rows.keys()].sort((a, b) => a - b)) {
          const cs = rows.get(r).sort((a, b) => a.col - b.col);
          const parts = cs.map((c) => {
            if (c.container == null) return '';
            const sub = [];
            const C2 = F.containers[c.container];
            for (const k of C2.paras) {
              const s2 = at.get(k);
              if (s2) sub.push(mark(s2));
              else if (F.paras[k].text.trim()) sub.push(F.paras[k].text.trim());
            }
            return sub.join(' / ');
          });
          lines.push(`${indent}| ${parts.join(' | ')} |`);
        }
        lines.push(`${indent}</표>`);
      }
    }
  };
  walk(0, '');
  return lines.join('\n');
}

// ───────────────────────── 채우기 ─────────────────────────

/** 글 한 덩이가 차지할 줄 수 어림 (글자 폭 em 합 ÷ 한 줄 폭) */
const SPACE_EM = 0.5; // 한컴 글꼴의 공백 폭(글자 크기 대비) 어림
const emOf = (ch) => (/[가-힣ㄱ-ㅎㅏ-ㅣ一-鿿]/.test(ch) ? 1 : ch === ' ' ? SPACE_EM : /[A-Z]/.test(ch) ? 0.68 : 0.55);
const emWidth = (s) => [...s].reduce((a, c) => a + emOf(c), 0);
function visualLines(text, widthHwp, charH) {
  const per = Math.max(10, (widthHwp || 48000) / charH);
  return paragraphs(text).reduce((n, l) => n + Math.max(1, Math.ceil(emWidth(plain(l)) / per)), 0);
}

const openTag = (sec, p) => sec.slice(p.start, p.openEnd).replace(/\bpageBreak="1"/, 'pageBreak="0"').replace(/\bcolumnBreak="1"/, 'columnBreak="0"');

/**
 * 양식 구역 XML 한 부를 채운다.
 * @param values {[slotId]: text}
 */
export function fillSection(sec, slots, values, hdr, geo) {
  const F = parseForm(sec);
  const edits = [];
  const charH = (cp) => +(/ height="(\d+)"/.exec(new RegExp(`<hh:charPr id="${cp}"[\\s\\S]*?</hh:charPr>`).exec(hdr.xml)?.[0] ?? '')?.[1] ?? 1000);
  const newParas = (p, text) => {
    const cp = p.cp ?? '0';
    const h = charH(cp);
    const tag = openTag(sec, p);
    return paragraphs(text)
      .map((line) => `${tag}${inlineRuns(hdr, line, cp, h) || `<hp:run charPrIDRef="${cp}"><hp:t> </hp:t></hp:run>`}</hp:p>`)
      .join('');
  };
  for (const s of slots) {
    const v = String(values?.[s.id] ?? '').replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '');
    if (!v.trim()) continue;
    if (s.kind === 'field') {
      const r = fieldRanges(sec).find((x) => (/\bid="(\d+)"/.exec(sec.slice(x.start, x.start + 400))?.[1]) === s.field);
      if (!r) continue;
      const a = sec.indexOf('</hp:ctrl>', r.start) + '</hp:ctrl>'.length;
      const b = sec.lastIndexOf('<hp:ctrl>', r.end);
      if (a < 10 || b < a) continue;
      const mid = sec.slice(a, b);
      const one = esc(v.replace(/\n+/g, ' '));
      let first = true;
      let nm = mid.replace(/<hp:t>[\s\S]*?<\/hp:t>|<hp:t\/>/g, () => {
        if (first) {
          first = false;
          return `<hp:t>${one}</hp:t>`;
        }
        return '';
      });
      if (first) nm = `<hp:t>${one}</hp:t>` + mid;
      edits.push([a, b, nm]);
    } else if (s.kind === 'cell') {
      const ps = s.paras.map((i) => F.paras[i]).filter(Boolean);
      if (!ps.length) continue;
      edits.push([ps[0].start, ps[ps.length - 1].end, newParas(ps[0], v)]);
    } else if (s.kind === 'lines') {
      const ps = s.paras.map((i) => F.paras[i]).filter(Boolean);
      if (!ps.length) continue;
      const h = charH(ps[0].cp ?? '0');
      const width = s.w ? s.w - 1020 : geo.colWidth;
      const need = visualLines(v, width, h);
      const used = Math.min(ps.length, need);
      // 밑줄 친 빈칸 줄이면 답 뒤를 공백으로 채워 밑줄이 원래 길이만큼 이어지게
      let text = v;
      const cpBlock = new RegExp(`<hh:charPr id="${ps[0].cp}"[\\s\\S]*?</hh:charPr>`).exec(hdr.xml)?.[0] ?? '';
      if (/<hh:underline type="(BOTTOM|CENTER)"/.test(cpBlock) && !ps[0].text.trim() && ps[0].text.length >= 8) {
        const full = ps[0].text.length * SPACE_EM;
        text = paragraphs(v)
          .map((l) => {
            const w = emWidth(plain(l)) % (width / h);
            return l + ' '.repeat(Math.max(0, Math.floor((Math.min(full, width / h) - w - 1.5) / SPACE_EM)));
          })
          .join('\n');
      }
      // 답이 차지하는 줄만큼 빈 줄을 덜어 내고, 남는 빈 줄은 그대로 둔다
      edits.push([ps[0].start, ps[used - 1].end, newParas(ps[0], text)]);
    }
  }
  edits.sort((x, y) => y[0] - x[0]);
  let out = sec;
  for (const [a, b, t] of edits) out = out.slice(0, a) + t + out.slice(b);
  return out;
}

let objSeq = 1700000000 + Math.floor(Math.random() * 100000000);

/** 둘째 부부터: 구역·단·머리말·꼬리말 설정은 첫 부에만 두고, 개체 id 는 겹치지 않게 새로 매긴다 */
function asCopy(body) {
  const { paras } = topLevelParas(`<hs:sec>${body}</hs:sec>`);
  if (paras.length) {
    const off = '<hs:sec>'.length;
    const [s, e] = paras[0];
    let p0 = body.slice(s - off, e - off);
    p0 = p0.replace(/<hp:secPr\b[\s\S]*?<\/hp:secPr>/, '');
    p0 = removeCtrls(p0, /<hp:(colPr|header|footer|pageNum|pageHiding|newNum|pageNumCtrl)\b/);
    p0 = p0.replace(/^<hp:p\b[^>]*>/, (t) => (/\bpageBreak="/.test(t) ? t.replace(/\bpageBreak="\d"/, 'pageBreak="1"') : t.replace('<hp:p ', '<hp:p pageBreak="1" ')));
    body = body.slice(0, s - off) + p0 + body.slice(e - off);
  }
  const fmap = new Map();
  body = body.replace(/(<hp:fieldBegin\b[^>]*?\bid=")(\d+)"/g, (_, a, id) => {
    const n = String(objSeq++);
    fmap.set(id, n);
    return `${a}${n}"`;
  });
  body = body.replace(/(<hp:fieldEnd\b[^>]*?\bbeginIDRef=")(\d+)"/g, (all, a, id) => (fmap.has(id) ? `${a}${fmap.get(id)}"` : all));
  body = body.replace(/(<hp:(?:tbl|pic|rect|ellipse|line|arc|polygon|curve|connectLine|container|equation|ole|textart|video|chart)\b[^>]*?\s)id="\d+"/g, (_, a) => `${a}id="${objSeq++}"`);
  body = body.replace(/\binstid="\d+"/g, () => `instid="${objSeq++}"`);
  return body;
}

/** 문단 XML 에서 조건에 맞는 <hp:ctrl>…</hp:ctrl> 를 (안에 든 ctrl 까지 짝 맞춰) 지운다 */
function removeCtrls(xml, test) {
  let out = '';
  let i = 0;
  for (;;) {
    const s = xml.indexOf('<hp:ctrl>', i);
    if (s < 0) break;
    // 짝이 되는 </hp:ctrl>
    const re = /<(\/?)hp:ctrl>/g;
    re.lastIndex = s;
    let d = 0;
    let e = -1;
    let m;
    while ((m = re.exec(xml))) {
      d += m[1] ? -1 : 1;
      if (d === 0) {
        e = re.lastIndex;
        break;
      }
    }
    if (e < 0) break;
    const ctrl = xml.slice(s, e);
    out += xml.slice(i, s) + (test.test(ctrl.slice(0, 200)) ? '' : ctrl);
    i = e;
  }
  return out + xml.slice(i);
}

/**
 * 채움 양식 + 기록들 → hwpx 바이트. 기록마다 양식 한 부(새 쪽부터).
 * @param records [{[slotId]: text}]
 */
export function buildFilledHwpx(formPkg, slots, records, { title = '' } = {}) {
  const pkg = { files: Object.fromEntries(Object.entries(formPkg.files).map(([k, v]) => [k, v.slice()])) };
  const enc = new TextEncoder();
  const sec = readText(pkg, 'Contents/section0.xml');
  const hdr = new HeaderEditor(readText(pkg, 'Contents/header.xml'));
  const geo = geometry(sec);
  const secOpen = sec.indexOf('>', sec.indexOf('<hs:sec')) + 1;
  const close = sec.lastIndexOf('</hs:sec>');
  const recs = records.length ? records : [{}];
  const bodies = recs.map((vals, k) => {
    const filled = fillSection(sec, slots, vals, hdr, geo);
    const body = filled.slice(secOpen, filled.lastIndexOf('</hs:sec>'));
    return k === 0 ? body : asCopy(body);
  });
  pkg.files['Contents/section0.xml'] = enc.encode(sec.slice(0, secOpen) + bodies.join('') + sec.slice(close));
  pkg.files['Contents/header.xml'] = enc.encode(hdr.xml);

  let hpf = readText(pkg, 'Contents/content.hpf') || '';
  const extra = Object.keys(pkg.files).filter((k) => /^Contents\/section([1-9]\d*)\.xml$/.test(k));
  if (extra.length) {
    for (const k of extra) {
      const id = /section\d+/.exec(k)[0];
      delete pkg.files[k];
      hpf = hpf.replace(new RegExp(`<opf:item id="${id}"[^>]*/>`), '').replace(new RegExp(`<opf:itemref idref="${id}"[^>]*/>`), '');
    }
    pkg.files['Contents/header.xml'] = enc.encode(hdr.xml.replace(/(<hh:head\b[^>]*\bsecCnt=")\d+"/, (_, a) => `${a}1"`));
  }
  if (title) hpf = hpf.replace(/<opf:title>[\s\S]*?<\/opf:title>|<opf:title\/>/, `<opf:title>${esc(title)}</opf:title>`);
  hpf = hpf.replace(/(<opf:meta name="(?:creator|lastsaveby|subject|description|keyword|date)"[^>]*>)[\s\S]*?(<\/opf:meta>)/g, '$1$2');
  pkg.files['Contents/content.hpf'] = enc.encode(hpf);
  if (pkg.files['Preview/PrvText.txt']) {
    pkg.files['Preview/PrvText.txt'] = enc.encode(recs.map((r) => Object.values(r).join(' ')).join('\r\n').slice(0, 1000));
  }
  if (pkg.files['Preview/PrvImage.png']) {
    pkg.files['Preview/PrvImage.png'] = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAgAAAALCAAAAABn8JP5AAAAD0lEQVR4nGP4DwUMNGMAAPRPV6nJuRPhAAAAAElFTkSuQmCC'), (c) => c.charCodeAt(0));
  }
  return savePackage(pkg);
}

/** 화면 미리보기용 양식 나무 (기록 하나를 채운 모양) → HTML 조각을 만드는 데 쓰는 구조 */
export function formTree(pkg) {
  const sec = readText(pkg, 'Contents/section0.xml');
  const F = parseForm(sec);
  const header = readText(pkg, 'Contents/header.xml');
  const bold = new Set();
  const big = new Map();
  for (const m of header.matchAll(/<hh:charPr id="(\d+)"[\s\S]*?<\/hh:charPr>/g)) {
    if (/<hh:bold\/>/.test(m[0])) bold.add(m[1]);
    big.set(m[1], +(/ height="(\d+)"/.exec(m[0])?.[1] ?? 1000));
  }
  const center = new Set();
  for (const m of header.matchAll(/<hh:paraPr id="(\d+)"[\s\S]*?<\/hh:paraPr>/g)) {
    if (/<hh:align horizontal="CENTER"/.test(m[0])) center.add(m[1]);
  }
  const ul = underlineSet(header);
  const tableOf = new Map(F.tables.filter((t) => t.para != null && !t.skip).map((t) => [t.para, t]));
  const node = (cid) =>
    F.containers[cid].paras.map((i) => {
      const p = F.paras[i];
      const open = sec.slice(p.start, p.openEnd);
      const pp = /paraPrIDRef="(\d+)"/.exec(open)?.[1];
      const T = tableOf.get(i);
      return {
        i,
        text: p.text,
        bold: bold.has(p.cp),
        size: (big.get(p.cp) ?? 1000) / 100,
        center: center.has(pp),
        under: ul.has(p.cp),
        table: T
          ? {
              rows: Math.max(...T.cells.map((c) => c.row + c.rowSpan)),
              width: T.cells.filter((c) => c.row === 0).reduce((a, c) => a + c.w, 0),
              cells: T.cells.map((c) => ({ row: c.row, col: c.col, colSpan: c.colSpan, rowSpan: c.rowSpan, w: c.w, paras: c.container != null ? node(c.container) : [] })),
            }
          : null,
      };
    });
  return node(0);
}
