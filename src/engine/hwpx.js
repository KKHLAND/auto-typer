// hwpx 양식 엔진
//
// 어떤 hwpx 든 같은 방식으로 다룬다:
//   1) 본문 첫 문단(p0)에는 구역 설정·단 설정·머리 표·머리말/꼬리말이 들어 있다 → 그대로 보존
//   2) 나머지 본문 문단을 훑어 발문·지문·선지·묶음 지시문 등이 어떤 서식(paraPr/style/charPr)을
//      쓰는지 '학습'한다 (analyzeTemplate)
//   3) 시험지 문서(exam-doc)를 그 서식으로 다시 써서 p0 뒤에 붙인다 (buildHwpx)
// 밑줄·굵게·가운데 정렬·상자 테두리처럼 양식에 없을 수 있는 서식은 header.xml 에 복제해 추가한다.

import { unzipSync, zipSync } from 'fflate';
import { toHwpEquation, measureEquation } from './equation.js';
import { parseInline, paragraphs, plain } from './markup.js';
import { blockSummary } from '../model.js';

// 8×11 흰색 PNG (미리보기 썸네일 자리 채움)
const BLANK_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAALCAAAAABn8JP5AAAAD0lEQVR4nGP4DwUMNGMAAPRPV6nJuRPhAAAAAElFTkSuQmCC';

const dec = new TextDecoder('utf-8');
const enc = new TextEncoder();

export const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const unesc = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** hp:t 내부 → 사람이 읽는 텍스트 */
export function tText(inner) {
  return unesc(
    inner
      .replace(/<hp:fwSpace\/>/g, ' ')
      .replace(/<hp:nbSpace\/>/g, ' ')
      .replace(/<hp:tab[^>]*\/>/g, '\t')
      .replace(/<hp:lineBreak\/>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  );
}

// ───────────────────────── 패키지 입출력 ─────────────────────────

export function loadHwpx(bytes) {
  const files = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  if (!files['Contents/section0.xml'] || !files['Contents/header.xml']) {
    throw new Error('hwpx 형식이 아닙니다 (Contents/section0.xml 없음)');
  }
  return { files };
}

export const readText = (pkg, name) => (pkg.files[name] ? dec.decode(pkg.files[name]) : null);
const writeText = (pkg, name, s) => {
  pkg.files[name] = enc.encode(s);
};

export function savePackage(pkg) {
  // mimetype 은 반드시 맨 앞, 무압축
  const out = {};
  if (pkg.files.mimetype) out.mimetype = [pkg.files.mimetype, { level: 0 }];
  for (const [k, v] of Object.entries(pkg.files)) {
    if (k === 'mimetype') continue;
    out[k] = [v, { level: /\.(png|jpe?g|gif|bmp)$/i.test(k) ? 0 : 6 }];
  }
  return zipSync(out);
}

const clonePkg = (pkg) => ({ files: Object.fromEntries(Object.entries(pkg.files).map(([k, v]) => [k, v.slice()])) });

// ───────────────────────── XML 스캔 도구 ─────────────────────────

/** 최상위 <hp:p> 들의 [start,end) 범위 */
export function topLevelParas(xml) {
  const secOpen = xml.indexOf('>', xml.indexOf('<hs:sec')) + 1;
  const re = /<(\/?)hp:p(?=[\s>])[^>]*?(\/?)>/g;
  re.lastIndex = secOpen;
  const out = [];
  let depth = 0;
  let start = -1;
  let m;
  while ((m = re.exec(xml))) {
    if (m[1]) {
      depth--;
      if (depth === 0) out.push([start, re.lastIndex]);
    } else if (!m[2]) {
      if (depth === 0) start = m.index;
      depth++;
    }
  }
  return { secOpen, paras: out };
}

/** 문단 XML 의 최상위 run 들 (표·글상자 속 run 제외) */
function topRuns(pXml) {
  const runs = [];
  const re = /<(\/?)hp:(run|subList)(?=[\s>/])[^>]*?(\/?)>/g;
  let sub = 0;
  let cur = null;
  let m;
  while ((m = re.exec(pXml))) {
    const [tag, close, name, self] = m;
    if (name === 'subList') {
      if (self) continue;
      sub += close ? -1 : 1;
      continue;
    }
    if (sub > 0) continue;
    if (!close) {
      const cp = /charPrIDRef="(\d+)"/.exec(tag)?.[1];
      if (self) runs.push({ charPr: cp, text: '', ctrl: false });
      else cur = { charPr: cp, start: re.lastIndex };
    } else if (cur) {
      const inner = pXml.slice(cur.start, m.index);
      // run 직속 hp:t 만 (컨트롤 내부는 subList 로 걸러짐 — 표 속 텍스트 제외 위해 subList 제거)
      const flat = inner.replace(/<hp:subList[\s\S]*<\/hp:subList>/g, '');
      const text = [...flat.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)].map((x) => tText(x[1])).join('');
      runs.push({ charPr: cur.charPr, text, ctrl: /<hp:(tbl|pic|container|rect|equation|ctrl)\b/.test(flat) });
      cur = null;
    }
  }
  return runs;
}

const attr = (tag, name) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

function block(xml, tag, id) {
  const re = new RegExp(`<hh:${tag} id="${id}"[\\s\\S]*?</hh:${tag}>`);
  return re.exec(xml)?.[0] ?? null;
}

// ───────────────────────── 양식 분석 ─────────────────────────

// 목록 항목의 머리 기호: • ○ ※ - 1. 1) (1) 가. ① ㉠ ⓐ Ⅰ. 등 — 원문 글자 그대로 둔다
export const LIST_RE = /^\s*(?:[•·∙◦○●◎□■▪▫▶▷►※✓✔\-–*]|\(?\d{1,2}[.)]|\(?[가-하][.)]|[①-⑳㉠-㉭ⓐ-ⓩ]|[ⅰ-ⅻⅠ-Ⅻ][.)]?|\[\d{1,2}\])\s*\S/;

/** 글자 모양 요약: 크기(HWPUNIT, 1000=10pt)·굵게·밑줄·한글 글꼴 */
function charInfo(header, cp) {
  const b = block(header, 'charPr', cp) || '';
  const fid = /<hh:fontRef hangul="(\d+)"/.exec(b)?.[1];
  const hangul = /<hh:fontface lang="HANGUL"[\s\S]*?<\/hh:fontface>/.exec(header)?.[0] || '';
  const face = fid != null ? new RegExp(`<hh:font id="${fid}" face="([^"]*)"`).exec(hangul)?.[1] : null;
  return {
    h: +(/ height="(\d+)"/.exec(b)?.[1] ?? 1000),
    bold: /<hh:bold\/>/.test(b),
    u: /<hh:underline type="(BOTTOM|CENTER|TOP)"/.test(b),
    face: face || null,
  };
}

/** 문단 모양 요약 (hp:case 값, HWPUNIT) */
function paraInfo(header, pp) {
  const b = block(header, 'paraPr', pp) || '';
  const cs = /<hp:case[\s\S]*?<\/hp:case>/.exec(b)?.[0] || b;
  const v = (n) => +(new RegExp(`<hc:${n} value="(-?\\d+)"`).exec(cs)?.[1] ?? 0);
  const ls = /<hh:lineSpacing type="(\w+)" value="(\d+)"/.exec(cs);
  return {
    align: /<hh:align horizontal="(\w+)"/.exec(b)?.[1] || 'JUSTIFY',
    intent: v('intent'),
    left: v('left'),
    prev: v('prev'),
    next: v('next'),
    line: ls && ls[1] === 'PERCENT' ? +ls[2] : 160,
    heading: /<hh:heading type="(\w+)"/.exec(b)?.[1] || 'NONE',
  };
}

/**
 * 양식 분석: 본문 문단을 훑어 역할별 서식을 배운다.
 *   body(본문) · list(목록) · h1~h3(소제목) · spacer(빈 줄)
 * 배우지 못한 역할은 본문에서 파생(크기·굵기)하도록 derive 로 표시한다.
 * @returns {{profile, css, geometry, headerTexts, stats}}
 */
export function analyzeTemplate(pkg) {
  const sec = readText(pkg, 'Contents/section0.xml');
  const header = readText(pkg, 'Contents/header.xml');
  const { paras } = topLevelParas(sec);
  if (!paras.length) throw new Error('본문 문단이 없습니다');

  const styleName = (id) => new RegExp(`<hh:style id="${id}"[^>]*name="([^"]*)"`).exec(header)?.[1] || '';
  const samples = [];
  paras.slice(1).forEach(([s, e]) => {
    const p = sec.slice(s, e);
    const open = /<hp:p\b[^>]*>/.exec(p)[0];
    const runs = topRuns(p);
    if (runs.some((r) => r.ctrl)) return; // 표·그림 문단은 학습 제외
    const text = runs.map((r) => r.text).join('').trim();
    // 가장 많은 글자를 차지한 (밑줄 아닌) 글자 모양
    const weight = new Map();
    for (const r of runs) {
      if (!r.text.trim() || charInfo(header, r.charPr).u) continue;
      weight.set(r.charPr, (weight.get(r.charPr) ?? 0) + r.text.length);
    }
    const cp = [...weight.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? runs[0]?.charPr ?? '0';
    const ci = charInfo(header, cp);
    samples.push({
      pp: attr(open, 'paraPrIDRef'),
      st: attr(open, 'styleIDRef'),
      cp,
      text,
      len: text.length,
      h: ci.h,
      bold: ci.bold,
      sname: styleName(attr(open, 'styleIDRef')),
    });
  });

  const keyOf = (x) => `${x.pp}|${x.st}|${x.cp}`;
  const pick = (list) => {
    const k = mode(list.map(keyOf));
    if (!k) return null;
    const [paraPr, style, charPr] = k.split('|');
    return { paraPr, style, charPr };
  };
  const nonEmpty = samples.filter((x) => x.text);
  const isList = (x) => LIST_RE.test(x.text);

  const bodyCands = nonEmpty.filter((x) => !isList(x) && x.len >= 40);
  const body = pick(bodyCands) ?? pick(nonEmpty.filter((x) => !isList(x))) ?? pick(nonEmpty) ?? { paraPr: '0', style: '0', charPr: '0' };
  const bodyC = charInfo(header, body.charPr);
  const listCands = nonEmpty.filter(isList);
  const list = pick(listCands);

  // 소제목 후보: 짧고, 본문보다 크거나 굵거나, 스타일 이름이 제목·개요인 문단
  const headCands = nonEmpty.filter(
    (x) => !isList(x) && x.len <= 60 && keyOf(x) !== keyOf({ pp: body.paraPr, st: body.style, cp: body.charPr }) &&
      (x.h >= bodyC.h * 1.08 || (x.bold && !bodyC.bold) || /제목|개요|heading|title/i.test(x.sname)),
  );
  // 크기·굵기가 같은 것끼리 묶어 큰 순서로 1~3단계
  const tiers = new Map();
  for (const x of headCands) {
    const t = `${x.h}|${x.bold ? 1 : 0}`;
    if (!tiers.has(t)) tiers.set(t, []);
    tiers.get(t).push(x);
  }
  const ranked = [...tiers.entries()]
    .sort((a, b) => {
      const [ha, ba] = a[0].split('|').map(Number);
      const [hb, bb] = b[0].split('|').map(Number);
      return hb - ha || bb - ba;
    })
    .slice(0, 3)
    .map(([, xs]) => pick(xs));

  const DERIVE = [1.5, 1.25, 1.1];
  const heads = [0, 1, 2].map((i) => ranked[i] ?? { derive: { scale: DERIVE[i], bold: true } });
  const spacer = pick(samples.filter((x) => !x.text)) ?? body;

  const profile = { body, list: list ?? { derive: { list: true } }, h1: heads[0], h2: heads[1], h3: heads[2], spacer };
  return {
    profile,
    css: roleCss(header, profile),
    geometry: geometry(sec),
    headerTexts: collectHeaderTexts(pkg),
    stats: { paragraphs: nonEmpty.length, body: bodyCands.length, list: listCands.length, heading: ranked.length },
  };
}

/** 미리보기용 역할별 CSS 값 (pt·em) — hwpx 의 실제 서식을 화면에 근사 */
export function roleCss(header, profile) {
  const base = (role) => {
    const r = profile[role];
    const src = r.derive ? profile.body : r;
    const c = charInfo(header, src.charPr);
    const p = paraInfo(header, src.paraPr);
    const out = {
      size: +(c.h / 100).toFixed(1),
      bold: c.bold,
      face: c.face,
      align: p.align,
      indent: +(p.intent / 100).toFixed(1),
      left: +(p.left / 100).toFixed(1),
      line: p.line,
      prev: +(p.prev / 100).toFixed(1),
      next: +(p.next / 100).toFixed(1),
    };
    if (r.derive?.scale) Object.assign(out, { size: +(out.size * r.derive.scale).toFixed(1), bold: true, indent: 0, left: 0, align: 'LEFT', prev: out.size * 0.6 });
    if (r.derive?.list) Object.assign(out, { indent: -12, left: 12 });
    return out;
  };
  const list = base('list');
  const list2 = profile.list2 && !profile.list2.derive ? base('list2') : { ...list, left: +(list.left + 18).toFixed(1) };
  const list3 = profile.list3 && !profile.list3.derive ? base('list3') : { ...list2, left: +(list2.left + 18).toFixed(1) };
  return { body: base('body'), list, list2, list3, h1: base('h1'), h2: base('h2'), h3: base('h3') };
}

function mode(arr) {
  const c = new Map();
  let best = null;
  let bn = 0;
  for (const x of arr) {
    if (x == null) continue;
    const n = (c.get(x) ?? 0) + 1;
    c.set(x, n);
    if (n > bn) {
      bn = n;
      best = x;
    }
  }
  return best;
}

/** 쪽 크기·여백·단 너비 (HWPUNIT, 1mm ≈ 283.46) */
export function geometry(sec) {
  const pagePr = /<hp:pagePr[^>]*>/.exec(sec)?.[0] ?? '';
  const margin = /<hp:margin[^>]*>/.exec(sec.slice(sec.indexOf('<hp:pagePr')))?.[0] ?? '';
  const colPr = /<hp:colPr[^>]*>/.exec(sec)?.[0] ?? '';
  const W = +attr(pagePr, 'width') || 59528;
  const H = +attr(pagePr, 'height') || 84188;
  const m = {
    left: +attr(margin, 'left') || 0,
    right: +attr(margin, 'right') || 0,
    top: +attr(margin, 'top') || 0,
    bottom: +attr(margin, 'bottom') || 0,
    header: +attr(margin, 'header') || 0,
    footer: +attr(margin, 'footer') || 0,
  };
  const cols = +attr(colPr, 'colCount') || 1;
  const gap = +attr(colPr, 'sameGap') || 0;
  const bodyW = W - m.left - m.right;
  return { width: W, height: H, margin: m, cols, gap, colWidth: Math.floor((bodyW - gap * (cols - 1)) / cols) };
}

// ───────────────────────── 머리 문구 (p0 · 바탕쪽) ─────────────────────────

const HEADER_FILES = (pkg) => [
  'Contents/section0.xml#p0',
  ...Object.keys(pkg.files).filter((k) => /^Contents\/masterpage\d+\.xml$/.test(k)),
];

function headerScope(pkg, file) {
  if (file.endsWith('#p0')) {
    const sec = readText(pkg, 'Contents/section0.xml');
    const [s, e] = topLevelParas(sec).paras[0];
    return { xml: sec.slice(s, e), put: (nx) => writeText(pkg, 'Contents/section0.xml', sec.slice(0, s) + nx + sec.slice(e)) };
  }
  const xml = readText(pkg, file);
  return { xml, put: (nx) => writeText(pkg, file, nx) };
}

/** 양식 머리 부분의 모든 문구: [{key, file, index, text}] */
export function collectHeaderTexts(pkg) {
  const out = [];
  for (const file of HEADER_FILES(pkg)) {
    const { xml } = headerScope(pkg, file);
    const ranges = fieldRanges(xml);
    let i = 0;
    for (const m of xml.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)) {
      const text = tText(m[1]);
      const f = inField(ranges, m.index);
      // field = 필드 이름(개방형·학번·이름 등) — 누름틀·메일 머지 자리
      if (text.trim()) out.push({ key: `${file}@${i}`, file, index: i, text, ...(f ? { field: f.name || text.replace(/[{}]/g, '') } : {}) });
      i++;
    }
  }
  return out;
}

/** 누름틀·메일 머지 필드의 범위 [{start, end, name}] (fieldBegin ~ 짝이 되는 fieldEnd) */
export function fieldRanges(xml) {
  const out = [];
  for (const m of xml.matchAll(/<hp:fieldBegin\b[^>]*\bid="(\d+)"[^>]*>([\s\S]*?)<\/hp:fieldBegin>/g)) {
    const endTag = new RegExp(`<hp:fieldEnd\\b[^>]*beginIDRef="${m[1]}"`).exec(xml.slice(m.index));
    if (!endTag) continue;
    const name = /<hp:stringParam name="Command">([^<]*)<\/hp:stringParam>/.exec(m[2])?.[1] || '';
    out.push({ start: m.index, end: m.index + endTag.index, name });
  }
  return out;
}
const inField = (ranges, pos) => ranges.find((r) => pos > r.start && pos < r.end);

function applyHeaderEdits(pkg, edits) {
  const byFile = {};
  for (const [key, text] of Object.entries(edits || {})) {
    const at = key.lastIndexOf('@');
    (byFile[key.slice(0, at)] ??= {})[+key.slice(at + 1)] = text;
  }
  for (const [file, map] of Object.entries(byFile)) {
    if (file !== 'Contents/section0.xml#p0' && !pkg.files[file]) continue;
    const scope = headerScope(pkg, file);
    let i = 0;
    const nx = scope.xml.replace(/<hp:t>([\s\S]*?)<\/hp:t>/g, (all) => {
      const idx = i++;
      // 빈 값은 공백 하나로 — 빈 필드는 한글이 '손상된 문서'로 거부한다
      return idx in map ? `<hp:t>${esc(map[idx] === '' ? ' ' : map[idx])}</hp:t>` : all;
    });
    scope.put(nx);
  }
}

/**
 * p0 의 최상위 run 직속 본문 글자(예: 수능 양식의 '[1~3] 다음 글을…')는 비운다.
 * 단 필드(학번·이름 같은 누름틀·메일 머지) 안의 글자와 자리 맞춤용 공백은 그대로 둔다
 * — 빈 필드는 한글이 '손상된 문서'로 여겨 열지 않는다.
 */
function clearP0BodyText(p0) {
  let out = '';
  let sub = 0;
  let last = 0;
  const ranges = fieldRanges(p0);
  const re = /<(\/?)hp:subList(?=[\s>/])[^>]*?(\/?)>|<hp:t>[\s\S]*?<\/hp:t>/g;
  let m;
  while ((m = re.exec(p0))) {
    if (m[0].startsWith('<hp:t>')) {
      const keep = inField(ranges, m.index) || !tText(m[0].slice(6, -7)).trim();
      if (sub === 0 && !keep) {
        out += p0.slice(last, m.index) + '<hp:t/>';
        last = re.lastIndex;
      }
    } else if (!m[2]) sub += m[1] ? -1 : 1;
  }
  return out + p0.slice(last);
}

// ───────────────────────── header.xml 서식 파생 ─────────────────────────

export class HeaderEditor {
  constructor(xml) {
    this.xml = xml;
    this.cache = new Map();
  }
  maxId(tag) {
    let max = -1;
    for (const m of this.xml.matchAll(new RegExp(`<hh:${tag} id="(\\d+)"`, 'g'))) max = Math.max(max, +m[1]);
    return max;
  }
  append(listTag, tag, xml) {
    const close = `</hh:${listTag}>`;
    const at = this.xml.indexOf(close);
    this.xml = this.xml.slice(0, at) + xml + this.xml.slice(at);
    this.xml = this.xml.replace(new RegExp(`<hh:${listTag} itemCnt="(\\d+)"`), (_, n) => `<hh:${listTag} itemCnt="${+n + 1}"`);
  }
  /** charPr 파생: {u, b, color} */
  charPr(base, { u = false, b = false, size = null } = {}) {
    if (!u && !b && !size) return base;
    const k = `c|${base}|${u}|${b}|${size}`;
    if (this.cache.has(k)) return this.cache.get(k);
    let x = block(this.xml, 'charPr', base);
    if (!x) return base;
    const id = String(this.maxId('charPr') + 1);
    x = x.replace(/<hh:charPr id="\d+"/, `<hh:charPr id="${id}"`);
    if (u) x = x.replace(/<hh:underline type="[A-Z]+"/, '<hh:underline type="BOTTOM"');
    if (b && !/<hh:bold\/>/.test(x)) x = x.replace('<hh:underline', '<hh:bold/><hh:underline');
    if (size) x = x.replace(/ height="\d+"/, ` height="${size}"`);
    this.append('charProperties', 'charPr', x);
    this.cache.set(k, id);
    return id;
  }
  /** paraPr 파생: {align, intent, left, prev, next, noHeading, line(줄 간격 %)} (HWPUNIT, hp:case 기준) */
  paraPr(base, o) {
    const k = `p|${base}|${JSON.stringify(o)}`;
    if (this.cache.has(k)) return this.cache.get(k);
    let x = block(this.xml, 'paraPr', base);
    if (!x) return base;
    const id = String(this.maxId('paraPr') + 1);
    x = x.replace(/<hh:paraPr id="\d+"/, `<hh:paraPr id="${id}"`);
    if (o.align) x = x.replace(/<hh:align horizontal="[A-Z_]+"/, `<hh:align horizontal="${o.align}"`);
    if (o.noHeading) x = x.replace(/<hh:heading [^>]*\/>/, '<hh:heading type="NONE" idRef="0" level="0"/>');
    // 문단 테두리(예: 시험지의 지문 상자)는 떼어 낸다 — 상자는 'box' 블록으로 따로 그린다
    if (!o.keepBorder) x = x.replace(/<hh:border borderFillIDRef="\d+"/, `<hh:border borderFillIDRef="${this.noneBorder()}"`);
    const setM = (name, v) => {
      if (v == null) return;
      // hp:case 는 그대로, hp:default 는 2배 값 (한글 저장 규칙)
      x = x.replace(/<hp:case[\s\S]*?<\/hp:case>/, (c) =>
        c.replace(new RegExp(`<hc:${name} value="-?\\d+"`), `<hc:${name} value="${v}"`),
      );
      x = x.replace(/<hp:default>[\s\S]*?<\/hp:default>/, (c) =>
        c.replace(new RegExp(`<hc:${name} value="-?\\d+"`), `<hc:${name} value="${v * 2}"`),
      );
      if (!/<hp:switch>/.test(x)) x = x.replace(new RegExp(`<hc:${name} value="-?\\d+"`), `<hc:${name} value="${v}"`);
    };
    if (o.line) x = x.replace(/<hh:lineSpacing type="[A-Z_]+" value="\d+"/g, `<hh:lineSpacing type="PERCENT" value="${o.line}"`);
    setM('intent', o.intent);
    setM('left', o.left);
    setM('prev', o.prev);
    setM('next', o.next);
    this.append('paraProperties', 'paraPr', x);
    this.cache.set(k, id);
    return id;
  }
  /** 테두리 없음 (있으면 재사용) */
  noneBorder() {
    if (this.cache.has('noneBorder')) return this.cache.get('noneBorder');
    let id = null;
    for (const m of this.xml.matchAll(/<hh:borderFill id="(\d+)"[\s\S]*?<\/hh:borderFill>/g)) {
      const b = m[0];
      const sides = ['left', 'right', 'top', 'bottom'].map((s) => new RegExp(`<hh:${s}Border type="NONE"`).test(b));
      if (sides.every(Boolean) && !/<hc:winBrush faceColor="#(?!FFFFFF)[0-9A-F]{6}"/i.test(b)) {
        id = m[1];
        break;
      }
    }
    if (id == null) {
      id = String(this.maxId('borderFill') + 1);
      const line = (n) => `<hh:${n} type="NONE" width="0.1 mm" color="#000000"/>`;
      this.append(
        'borderFills',
        'borderFill',
        `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">` +
          `<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>` +
          line('leftBorder') + line('rightBorder') + line('topBorder') + line('bottomBorder') +
          `<hh:diagonal type="NONE" width="0.1 mm" color="#000000"/></hh:borderFill>`,
      );
    }
    this.cache.set('noneBorder', id);
    return id;
  }
  /** 사방 실선 테두리 */
  boxBorder() {
    const k = 'boxBorder';
    if (this.cache.has(k)) return this.cache.get(k);
    const id = String(this.maxId('borderFill') + 1);
    const line = (n) => `<hh:${n} type="SOLID" width="0.12 mm" color="#000000"/>`;
    this.append(
      'borderFills',
      'borderFill',
      `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">` +
        `<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>` +
        line('leftBorder') + line('rightBorder') + line('topBorder') + line('bottomBorder') +
        `<hh:diagonal type="NONE" width="0.1 mm" color="#000000"/></hh:borderFill>`,
    );
    this.cache.set(k, id);
    return id;
  }
}

// ───────────────────────── 문서 → 본문 XML ─────────────────────────

let objId = 1000000000 + Math.floor(Math.random() * 100000000);
const nextObjId = () => String(objId++);

/** 수식 → <hp:equation>. 한글은 열 때 수식 상자 크기를 다시 재지 않으므로 구조를 따라 크기를 어림한다 */
function eqXml(script, charHeight) {
  const hwp = toHwpEquation(script);
  const m = measureEquation(hwp);
  const w = Math.max(500, Math.round(m.w * charHeight));
  const ht = Math.round((m.up + m.dn) * charHeight);
  const base = Math.round((m.up / (m.up + m.dn)) * 100);
  return (
    `<hp:equation id="${nextObjId()}" zOrder="0" numberingType="EQUATION" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" version="Equation Version 60" baseLine="${base}" textColor="#000000" baseUnit="${charHeight}" lineMode="CHAR" font="HancomEQN">` +
    `<hp:sz width="${w}" widthRelTo="ABSOLUTE" height="${ht}" heightRelTo="ABSOLUTE" protect="0"/>` +
    `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
    `<hp:outMargin left="56" right="56" top="0" bottom="0"/><hp:shapeComment>수식입니다.</hp:shapeComment>` +
    `<hp:script>${esc(hwp)}</hp:script></hp:equation>`
  );
}

class Writer {
  constructor(pkg, analysis, opts = {}) {
    this.pkg = pkg;
    this.a = analysis;
    this.p = analysis.profile;
    this.hdr = new HeaderEditor(readText(pkg, 'Contents/header.xml'));
    this.opts = opts;
    this.images = [];
    // 새 그림 이름은 양식에 이미 있는 이름(BinData 파일·매니페스트 id)과 겹치지 않게
    const used = [...Object.keys(pkg.files), readText(pkg, 'Contents/content.hpf') ?? ''].join(' ');
    this.imgSeq = Math.max(0, ...[...used.matchAll(/image(\d+)/g)].map((m) => +m[1])) + 1;

    const P = this.p;
    const B = P.body;
    const heightOf = (cp) => +(/ height="(\d+)"/.exec(block(this.hdr.xml, 'charPr', cp) ?? '')?.[1] ?? 1000);
    const bodyH = heightOf(B.charPr);
    this.charHeight = bodyH;
    const leftOf = (pp) => {
      const b = block(this.hdr.xml, 'paraPr', pp) || '';
      const cs = /<hp:case[\s\S]*?<\/hp:case>/.exec(b)?.[0] || b;
      return +(/<hc:left value="(-?\d+)"/.exec(cs)?.[1] ?? 0);
    };

    // 역할 → 실제 {paraPr, style, charPr}. 배운 서식은 그대로, 없으면 본문에서 파생.
    // 자동 번호(개요·문단 번호)는 꺼서 원문 번호와 겹치지 않게 한다.
    const resolve = (r) => {
      if (!r.derive) return { paraPr: this.hdr.paraPr(r.paraPr, { noHeading: true }), style: r.style, charPr: r.charPr };
      if (r.derive.scale) {
        return {
          paraPr: this.hdr.paraPr(B.paraPr, { noHeading: true, intent: 0, left: 0, align: 'LEFT', prev: Math.round(bodyH * 0.6) }),
          style: B.style,
          charPr: this.hdr.charPr(B.charPr, { b: true, size: Math.round(bodyH * r.derive.scale) }),
        };
      }
      return { paraPr: this.hdr.paraPr(B.paraPr, { noHeading: true, intent: -1200, left: 1200 }), style: B.style, charPr: B.charPr };
    };
    this.R = {
      body: { paraPr: this.hdr.paraPr(B.paraPr, { noHeading: true }), style: B.style, charPr: B.charPr },
      h1: resolve(P.h1),
      h2: resolve(P.h2),
      h3: resolve(P.h3),
      list1: resolve(P.list),
    };
    // 목록 2·3단계: 1단계보다 한 칸씩 더 들여쓴다
    const L = this.R.list1;
    const baseLeft = leftOf(L.paraPr);
    // 양식에 2·3단계 목록 서식이 따로 있으면 그것을, 없으면 1단계보다 한 칸씩 더 들여쓴다
    this.R.list2 = P.list2 && !P.list2.derive ? resolve(P.list2) : { ...L, paraPr: this.hdr.paraPr(L.paraPr, { left: baseLeft + 1800 }) };
    this.R.list3 = P.list3 && !P.list3.derive ? resolve(P.list3) : { ...this.R.list2, paraPr: this.hdr.paraPr(this.R.list2.paraPr, { left: leftOf(this.R.list2.paraPr) + 1800 }) };
    // 자료 제목: 1단계 소제목을 키워 가운데로
    const h1H = heightOf(this.R.h1.charPr);
    this.R.title = {
      paraPr: this.hdr.paraPr(this.R.h1.paraPr, { align: 'CENTER', intent: 0, left: 0 }),
      style: this.R.h1.style,
      charPr: this.hdr.charPr(this.R.h1.charPr, { b: true, size: Math.round(Math.max(h1H * 1.15, bodyH * 1.6)) }),
    };
    this.centerPara = this.hdr.paraPr(B.paraPr, { align: 'CENTER', intent: 0, left: 0, noHeading: true });
    // 표 칸은 왼쪽 정렬 — 양쪽 정렬이면 좁은 칸에서 글자 사이가 벌어진다
    this.cellPara = this.hdr.paraPr(B.paraPr, { align: 'LEFT', intent: 0, left: 0, noHeading: true, prev: 0, next: 0 });
    this.boxPara = this.hdr.paraPr(B.paraPr, { intent: 0, left: 0, noHeading: true, prev: 0, next: 0 });
  }

  runs(text, baseCp) {
    return parseInline(text)
      .map((r) => {
        if (r.eq) return `<hp:run charPrIDRef="${baseCp}">${eqXml(r.text, this.charHeight)}<hp:t/></hp:run>`;
        const cp = this.hdr.charPr(baseCp, { u: !!(r.u || r.blank), b: !!r.b });
        const t = r.blank ? '          ' : r.text;
        // 탭은 글자가 아니라 <hp:tab/> 요소로 (글 속 날것의 탭 문자는 한글이 문서를 열다 멈추게 한다)
        return `<hp:run charPrIDRef="${cp}"><hp:t>${esc(t).replace(/\t/g, '<hp:tab width="2000" leader="0" type="1"/>')}</hp:t></hp:run>`;
      })
      .join('');
  }

  para(paraPr, style, inner) {
    return `<hp:p id="0" paraPrIDRef="${paraPr}" styleIDRef="${style}" pageBreak="0" columnBreak="0" merged="0">${inner || `<hp:run charPrIDRef="${this.p.body.charPr}"><hp:t/></hp:run>`}</hp:p>`;
  }

  textParas(text, role) {
    return paragraphs(text)
      .map((line) => this.para(role.paraPr, role.style, this.runs(line, role.charPr)))
      .join('');
  }

  spacer() {
    const s = this.p.spacer;
    return this.para(s.paraPr, s.style, `<hp:run charPrIDRef="${s.charPr}"><hp:t/></hp:run>`);
  }

  /** 1행 1열 표로 그린 상자 */
  box(title, text) {
    const bf = this.hdr.boxBorder();
    const W = this.a.geometry.colWidth - 200;
    const B = this.R.body;
    let inner = '';
    if (title) inner += this.para(this.centerPara, '0', this.runs(title, B.charPr));
    inner += paragraphs(text)
      .map((line) => this.para(this.boxPara, '0', this.runs(line, B.charPr)))
      .join('');
    const lines = paragraphs(text).reduce((n, l) => n + Math.max(1, Math.ceil(plain(l).length / 40)), title ? 1 : 0);
    const H = Math.max(1500, Math.round(lines * this.charHeight * 1.7) + 600);
    return this.para(this.centerPara, '0', `<hp:run charPrIDRef="${B.charPr}">${this.tblXml(bf, W, [[{ inner, w: W, h: H }]], 510, 283)}<hp:t/></hp:run>`);
  }

  /** 표: 첫 행은 굵게, 칸 너비는 균등 */
  table(rows) {
    if (!rows?.length) return '';
    const bf = this.hdr.boxBorder();
    const W = this.a.geometry.colWidth - 200;
    const cols = Math.max(1, ...rows.map((r) => r.length));
    const cw = Math.floor(W / cols);
    const B = this.R.body;
    const boldCp = this.hdr.charPr(B.charPr, { b: true });
    const perLine = Math.max(6, (cw / this.charHeight) * 1.6);
    const grid = rows.map((r, ri) =>
      Array.from({ length: cols }, (_, ci) => {
        const t = r[ci] ?? '';
        const inner = paragraphs(t)
          .map((line) => this.para(this.cellPara, '0', this.runs(line, ri === 0 && rows.length > 1 ? boldCp : B.charPr)))
          .join('');
        const lines = paragraphs(t).reduce((n, l) => n + Math.max(1, Math.ceil(plain(l).length / perLine)), 0);
        return { inner, w: cw, h: Math.max(1000, Math.round(lines * this.charHeight * 1.6) + 400) };
      }),
    );
    return this.para(this.centerPara, '0', `<hp:run charPrIDRef="${B.charPr}">${this.tblXml(bf, cw * cols, grid, 283, 141)}<hp:t/></hp:run>`);
  }

  tblXml(bf, W, grid, padX, padY) {
    const rowH = grid.map((r) => Math.max(...r.map((c) => c.h)));
    const H = rowH.reduce((a, b) => a + b, 0);
    const multi = grid.length > 1;
    const trs = grid
      .map(
        (r, ri) =>
          `<hp:tr>${r
            .map(
              (c, ci) =>
                `<hp:tc name="" header="${ri === 0 && multi ? 1 : 0}" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="${bf}">` +
                `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${multi ? 'CENTER' : 'TOP'}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${c.inner || this.para(this.cellPara, '0', '')}</hp:subList>` +
                `<hp:cellAddr colAddr="${ci}" rowAddr="${ri}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${c.w}" height="${rowH[ri]}"/>` +
                `<hp:cellMargin left="${padX}" right="${padX}" top="${padY}" bottom="${padY}"/></hp:tc>`,
            )
            .join('')}</hp:tr>`,
      )
      .join('');
    return (
      `<hp:tbl id="${nextObjId()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${grid.length}" colCnt="${grid[0].length}" cellSpacing="0" borderFillIDRef="${bf}" noAdjust="0">` +
      `<hp:sz width="${W}" widthRelTo="ABSOLUTE" height="${H}" heightRelTo="ABSOLUTE" protect="0"/>` +
      `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
      `<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="${padX}" right="${padX}" top="${padY}" bottom="${padY}"/>` +
      `${trs}</hp:tbl>`
    );
  }

  figure(fig) {
    if (!fig?.src) return '';
    const m = /^data:image\/(png|jpe?g);base64,(.*)$/.exec(fig.src);
    if (!m) return '';
    const ext = m[1] === 'png' ? 'png' : 'jpg';
    const id = `image${this.imgSeq++}`;
    const bin = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    this.pkg.files[`BinData/${id}.${ext}`] = bin;
    this.images.push({ id, href: `BinData/${id}.${ext}`, type: ext === 'png' ? 'image/png' : 'image/jpeg' });
    const pxW = fig.w || 400;
    const pxH = fig.h || 300;
    const maxW = Math.round(this.a.geometry.colWidth * (fig.scale ?? 0.9));
    // 원본 크기를 알면(스캔본에서 잘라 낸 그림) 그 크기로, 모르면 화면 픽셀 크기로 — 단 너비를 넘지 않게
    const natural = fig.mmW ? Math.round(fig.mmW * 283.465) : pxW * 75;
    const w = Math.min(maxW, natural);
    const h = Math.round((w * pxH) / pxW);
    const pic =
      `<hp:pic id="${nextObjId()}" zOrder="0" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${nextObjId()}" reverse="0">` +
      `<hp:offset x="0" y="0"/><hp:orgSz width="${w}" height="${h}"/><hp:curSz width="${w}" height="${h}"/>` +
      `<hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="${w >> 1}" centerY="${h >> 1}" rotateimage="1"/>` +
      `<hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo>` +
      `<hc:img binaryItemIDRef="${id}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>` +
      `<hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${w}" y="0"/><hc:pt2 x="${w}" y="${h}"/><hc:pt3 x="0" y="${h}"/></hp:imgRect>` +
      `<hp:imgClip left="0" right="${pxW * 75}" top="0" bottom="${pxH * 75}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/>` +
      `<hp:imgDim dimwidth="${pxW * 75}" dimheight="${pxH * 75}"/><hp:effects/>` +
      `<hp:sz width="${w}" widthRelTo="ABSOLUTE" height="${h}" heightRelTo="ABSOLUTE" protect="0"/>` +
      `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
      `<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment>그림입니다.</hp:shapeComment></hp:pic>`;
    return this.para(this.centerPara, '0', `<hp:run charPrIDRef="${this.p.body.charPr}">${pic}<hp:t/></hp:run>`);
  }

  write(doc) {
    const R = this.R;
    const xs = [];
    const blocks = doc.blocks || [];
    blocks.forEach((b, i) => {
      const prev = blocks[i - 1];
      switch (b.type) {
        case 'title': {
          // 두 번째 자료 제목부터는 새 쪽에서 (예: 학생마다 한 장씩인 활동지 묶음)
          const t = this.textParas(b.text, R.title);
          xs.push(i > 0 ? t.replace('pageBreak="0"', 'pageBreak="1"') : t);
          xs.push(this.spacer());
          break;
        }
        case 'heading': {
          const lv = Math.min(3, Math.max(1, b.level || 1));
          if (i > 0 && lv <= 2 && prev?.type !== 'title') xs.push(this.spacer());
          xs.push(this.textParas(b.text, R[`h${lv}`]));
          break;
        }
        case 'list': {
          const lv = Math.min(3, Math.max(1, b.level || 1));
          xs.push(this.textParas(b.text, R[`list${lv}`]));
          break;
        }
        case 'box':
          xs.push(this.box(b.title, b.text));
          break;
        case 'table':
          xs.push(this.table(b.rows));
          if (b.text) xs.push(this.para(this.centerPara, R.body.style, this.runs(b.text, R.body.charPr)));
          break;
        case 'figure':
          xs.push(this.figure(b.figure));
          if (b.text) xs.push(this.para(this.centerPara, R.body.style, this.runs(b.text, R.body.charPr)));
          break;
        default:
          xs.push(this.textParas(b.text, R.body));
      }
    });
    return xs.join('');
  }
}

/** 학습자료 문서 → hwpx 바이트 */
export function buildHwpx(templatePkg, doc, opts = {}) {
  const pkg = clonePkg(templatePkg);
  const analysis = opts.analysis ?? analyzeTemplate(pkg);
  applyHeaderEdits(pkg, opts.headerEdits);

  const sec = readText(pkg, 'Contents/section0.xml');
  const { paras } = topLevelParas(sec);
  const [s0, e0] = paras[0];
  const p0 = clearP0BodyText(sec.slice(s0, e0));
  const w = new Writer(pkg, analysis, opts);
  const body = w.write(doc);
  writeText(pkg, 'Contents/section0.xml', sec.slice(0, s0) + p0 + body + '</hs:sec>');
  writeText(pkg, 'Contents/header.xml', w.hdr.xml);

  let hpf = readText(pkg, 'Contents/content.hpf');
  // 양식의 둘째 구역부터는 원래 내용이라 버린다 (본문은 첫 구역에 새로 쓴다)
  const extra = Object.keys(pkg.files).filter((k) => /^Contents\/section([1-9]\d*)\.xml$/.test(k));
  if (extra.length) {
    for (const k of extra) {
      const id = /section\d+/.exec(k)[0];
      delete pkg.files[k];
      hpf = hpf.replace(new RegExp(`<opf:item id="${id}"[^>]*/>`), '').replace(new RegExp(`<opf:itemref idref="${id}"[^>]*/>`), '');
    }
    w.hdr.xml = w.hdr.xml.replace(/(<hh:head\b[^>]*\bsecCnt=")\d+"/, (_, a) => `${a}1"`);
    writeText(pkg, 'Contents/header.xml', w.hdr.xml);
  }

  // 매니페스트: 쓰지 않는 BinData 정리 + 새 그림 등록
  const allXml = Object.keys(pkg.files)
    .filter((k) => k.endsWith('.xml'))
    .map((k) => readText(pkg, k))
    .join('');
  for (const m of [...hpf.matchAll(/<opf:item id="([^"]+)" href="(BinData\/[^"]+)"[^>]*\/>/g)]) {
    if (!allXml.includes(`binaryItemIDRef="${m[1]}"`)) {
      hpf = hpf.replace(m[0], '');
      delete pkg.files[m[2]];
    }
  }
  const items = w.images
    .map((im) => `<opf:item id="${im.id}" href="${im.href}" media-type="${im.type}" isEmbeded="1"/>`)
    .join('');
  hpf = hpf.replace('<opf:item id="section0"', items + '<opf:item id="section0"');
  if (doc.title) hpf = hpf.replace(/<opf:title>[\s\S]*?<\/opf:title>|<opf:title\/>/, `<opf:title>${esc(doc.title)}</opf:title>`);
  // 양식 원본의 문서 정보(만든 사람·마지막 저장한 사람·주제·날짜 등)는 남기지 않는다
  hpf = hpf.replace(
    /(<opf:meta name="(?:creator|lastsaveby|subject|description|keyword|date)"[^>]*>)[\s\S]*?(<\/opf:meta>)/g,
    '$1$2',
  );
  writeText(pkg, 'Contents/content.hpf', hpf);

  // 미리보기 텍스트
  if (pkg.files['Preview/PrvText.txt']) {
    writeText(pkg, 'Preview/PrvText.txt', previewText(doc).slice(0, 1000));
  }
  // 양식 원본 시험지의 첫 쪽 썸네일이 남지 않게 빈 그림으로 바꾼다 (한글이 저장할 때 다시 만든다)
  if (pkg.files['Preview/PrvImage.png']) {
    pkg.files['Preview/PrvImage.png'] = Uint8Array.from(atob(BLANK_PNG), (c) => c.charCodeAt(0));
  }
  return savePackage(pkg);
}

function previewText(doc) {
  return (doc.blocks || []).map((b) => plain(blockSummary(b))).join('\r\n');
}

/** 무거운 원본에서 본문을 걷어낸 가벼운 양식 파일 만들기 (내장 양식 제작용) */
export function stripToTemplate(pkg) {
  const analysis = analyzeTemplate(pkg);
  const bytes = buildHwpx(pkg, { title: '', blocks: [] }, { analysis });
  return { bytes, analysis };
}

export { toHwpEquation };
