// hwpx 양식 엔진
//
// 어떤 hwpx 든 같은 방식으로 다룬다:
//   1) 본문 첫 문단(p0)에는 구역 설정·단 설정·머리 표·머리말/꼬리말이 들어 있다 → 그대로 보존
//   2) 나머지 본문 문단을 훑어 발문·지문·선지·묶음 지시문 등이 어떤 서식(paraPr/style/charPr)을
//      쓰는지 '학습'한다 (analyzeTemplate)
//   3) 시험지 문서(exam-doc)를 그 서식으로 다시 써서 p0 뒤에 붙인다 (buildHwpx)
// 밑줄·굵게·가운데 정렬·상자 테두리처럼 양식에 없을 수 있는 서식은 header.xml 에 복제해 추가한다.

import { unzipSync, zipSync } from 'fflate';
import { parseInline, paragraphs, plain } from './markup.js';
import { CHOICE_MARKS, numberItems } from '../model.js';

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

/**
 * 양식 분석: 역할별 서식, 쪽 형상, 머리 문구 목록.
 * @returns {{profile, headerTexts, geometry, stats}}
 */
export function analyzeTemplate(pkg) {
  const sec = readText(pkg, 'Contents/section0.xml');
  const header = readText(pkg, 'Contents/header.xml');
  const { paras } = topLevelParas(sec);
  if (!paras.length) throw new Error('본문 문단이 없습니다');

  const headingOf = (pp) => {
    const b = block(header, 'paraPr', pp);
    return b ? attr(/<hh:heading[^>]*>/.exec(b)?.[0] ?? '', 'type') : 'NONE';
  };
  const isUnderlined = (cp) => {
    const b = block(header, 'charPr', cp);
    return b ? /<hh:underline type="(BOTTOM|CENTER|TOP)"/.test(b) : false;
  };

  const votes = { stem: [], choice: [], group: [], passage: [], spacer: [], number: [] };
  const stemNumberAuto = [];

  paras.slice(1).forEach(([s, e]) => {
    const p = sec.slice(s, e);
    const open = /<hp:p\b[^>]*>/.exec(p)[0];
    const pp = attr(open, 'paraPrIDRef');
    const st = attr(open, 'styleIDRef');
    const runs = topRuns(p);
    if (runs.some((r) => r.ctrl)) return; // 표·그림 문단은 학습 제외
    const text = runs.map((r) => r.text).join('').trim();
    const textRuns = runs.filter((r) => r.text.trim());
    const baseCp = mode(textRuns.filter((r) => !isUnderlined(r.charPr)).map((r) => r.charPr)) ?? runs[0]?.charPr;
    const key = { pp, st, cp: baseCp };

    if (!text) {
      votes.spacer.push(key);
      return;
    }
    if (/^[①-⑦]/.test(text)) votes.choice.push(key);
    else if (/^\[\s*\d+\s*[~∼～\-－]\s*\d+\s*\]/.test(text)) votes.group.push(key);
    else if (headingOf(pp) === 'NUMBER' || headingOf(pp) === 'OUTLINE') {
      votes.stem.push(key);
      stemNumberAuto.push(true);
    } else if (/^\d{1,2}\s*[.．]\s*\S/.test(text)) {
      // 번호를 직접 쓴 발문: 번호 run 의 글자 모양을 따로 기억
      const first = textRuns[0];
      const rest = textRuns.slice(1).filter((r) => !isUnderlined(r.charPr));
      const numOnly = /^\s*\d{1,2}\s*[.．]\s*$/.test(first.text);
      votes.stem.push({ ...key, cp: numOnly ? (mode(rest.map((r) => r.charPr)) ?? first.charPr) : first.charPr });
      if (numOnly) votes.number.push({ cp: first.charPr });
      stemNumberAuto.push(false);
    } else if (text.length > 40) votes.passage.push(key);
  });

  const pick = (list) => {
    const k = mode(list.map((v) => `${v.pp}|${v.st}|${v.cp}`));
    if (!k) return null;
    const [pp, st, cp] = k.split('|');
    return { paraPr: pp, style: st, charPr: cp };
  };

  const passage = pick(votes.passage) ?? pick(votes.stem) ?? { paraPr: '0', style: '0', charPr: '0' };
  const stem = pick(votes.stem) ?? passage;
  const choice = pick(votes.choice) ?? passage;
  const group = pick(votes.group) ?? stem;
  const spacer = pick(votes.spacer) ?? { ...choice };
  const numberCp = mode(votes.number.map((v) => v.cp)) ?? numberingCharPr(header, stem.paraPr) ?? null;

  const profile = {
    stem,
    stemAutoNumber: stemNumberAuto.filter(Boolean).length > stemNumberAuto.length / 2,
    numberCharPr: numberCp,
    choice,
    group,
    passage,
    spacer,
  };

  return {
    profile,
    geometry: geometry(sec),
    headerTexts: collectHeaderTexts(pkg),
    stats: Object.fromEntries(Object.entries(votes).map(([k, v]) => [k, v.length])),
  };
}

function numberingCharPr(header, paraPr) {
  const b = block(header, 'paraPr', paraPr);
  const h = b && /<hh:heading[^>]*>/.exec(b)?.[0];
  if (!h || attr(h, 'type') !== 'NUMBER') return null;
  const nb = block(header, 'numbering', attr(h, 'idRef'));
  const ph = nb && /<hh:paraHead[^>]*level="1"[^>]*>/.exec(nb)?.[0];
  const cp = ph && attr(ph, 'charPrIDRef');
  return cp && cp !== '4294967295' ? cp : null;
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
    let i = 0;
    for (const m of xml.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)) {
      const text = tText(m[1]);
      if (text.trim()) out.push({ key: `${file}@${i}`, file, index: i, text });
      i++;
    }
  }
  return out;
}

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
      return idx in map ? `<hp:t>${esc(map[idx])}</hp:t>` : all;
    });
    scope.put(nx);
  }
}

/** p0 의 최상위 run 직속 본문 글자(예: 수능 양식의 '[1~3] 다음 글을…')는 비운다 */
function clearP0BodyText(p0) {
  let out = '';
  let sub = 0;
  let last = 0;
  const re = /<(\/?)hp:subList(?=[\s>/])[^>]*?(\/?)>|<hp:t>[\s\S]*?<\/hp:t>/g;
  let m;
  while ((m = re.exec(p0))) {
    if (m[0].startsWith('<hp:t>')) {
      if (sub === 0) {
        out += p0.slice(last, m.index) + '<hp:t/>';
        last = re.lastIndex;
      }
    } else if (!m[2]) sub += m[1] ? -1 : 1;
  }
  return out + p0.slice(last);
}

// ───────────────────────── header.xml 서식 파생 ─────────────────────────

class HeaderEditor {
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
  /** paraPr 파생: {align, intent, left, prev, next, noHeading} (HWPUNIT, hp:case 기준) */
  paraPr(base, o) {
    const k = `p|${base}|${JSON.stringify(o)}`;
    if (this.cache.has(k)) return this.cache.get(k);
    let x = block(this.xml, 'paraPr', base);
    if (!x) return base;
    const id = String(this.maxId('paraPr') + 1);
    x = x.replace(/<hh:paraPr id="\d+"/, `<hh:paraPr id="${id}"`);
    if (o.align) x = x.replace(/<hh:align horizontal="[A-Z_]+"/, `<hh:align horizontal="${o.align}"`);
    if (o.noHeading) x = x.replace(/<hh:heading [^>]*\/>/, '<hh:heading type="NONE" idRef="0" level="0"/>');
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
    setM('intent', o.intent);
    setM('left', o.left);
    setM('prev', o.prev);
    setM('next', o.next);
    this.append('paraProperties', 'paraPr', x);
    this.cache.set(k, id);
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

/** 수식 너비(em) 대략치: 한글은 열 때 수식 크기를 다시 재지 않으므로 최대한 근사한다 */
export function eqWidthEm(script) {
  let s = script.replace(/\b(left|right|rm|it|bold)\b/g, '');
  let em = 0;
  // 첨자 {..} 또는 한 글자
  s = s.replace(/[\^_]\s*(\{[^}]*\}|\S)/g, (_, g) => {
    em += g.replace(/[{}\s]/g, '').length * 0.36;
    return '';
  });
  s = s.replace(/\b(sqrt|over|times|cdot|le|ge|ne|pi|theta|alpha|beta|sum|int|lim|from|to)\b/g, (k) => {
    em += k === 'over' ? 0 : k === 'sum' || k === 'int' ? 1.2 : 0.8;
    return '';
  });
  for (const ch of s.replace(/[{}\s`~]/g, '')) {
    if ('+-=<>±×÷'.includes(ch)) em += 1.0;
    else if ('()[],.|'.includes(ch)) em += 0.38;
    else em += 0.56;
  }
  return Math.max(0.6, em * 1.1);
}

function eqXml(script, charHeight) {
  // 수식: 한글이 열 때 스크립트로 다시 조판한다. 크기는 대략치.
  const w = Math.max(500, Math.round(eqWidthEm(script) * charHeight));
  return (
    `<hp:equation id="${nextObjId()}" zOrder="0" numberingType="EQUATION" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" version="Equation Version 60" baseLine="86" textColor="#000000" baseUnit="${charHeight}" lineMode="CHAR" font="HancomEQN">` +
    `<hp:sz width="${w}" widthRelTo="ABSOLUTE" height="${Math.round(charHeight * 1.2)}" heightRelTo="ABSOLUTE" protect="0"/>` +
    `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
    `<hp:outMargin left="56" right="56" top="0" bottom="0"/><hp:shapeComment>수식입니다.</hp:shapeComment>` +
    `<hp:script>${esc(script)}</hp:script></hp:equation>`
  );
}

class Writer {
  constructor(pkg, analysis, opts = {}) {
    this.pkg = pkg;
    this.a = analysis;
    this.p = analysis.profile;
    this.hdr = new HeaderEditor(readText(pkg, 'Contents/header.xml'));
    this.opts = opts;
    this.out = [];
    this.images = [];
    this.imgSeq = Object.keys(pkg.files).filter((k) => k.startsWith('BinData/')).length + 1;
    this.charHeight = +(/ height="(\d+)"/.exec(block(this.hdr.xml, 'charPr', this.p.passage.charPr) ?? '')?.[1] ?? 1000);

    const P = this.p;
    // 번호를 직접 쓰는 발문 문단: 자동 번호 끄고 내어쓰기
    this.stemPara = this.hdr.paraPr(P.stem.paraPr, { noHeading: true, intent: P.stemAutoNumber ? -1400 : undefined });
    this.groupPara = this.hdr.paraPr(P.group.paraPr, { noHeading: true });
    this.centerPara = this.hdr.paraPr(P.passage.paraPr, { align: 'CENTER', intent: 0, left: 0, noHeading: true });
    this.boxPara = this.hdr.paraPr(P.passage.paraPr, { intent: 0, left: 0, noHeading: true });
    this.numberCp = P.numberCharPr ?? this.hdr.charPr(P.stem.charPr, { b: true });
  }

  runs(text, baseCp) {
    return parseInline(text)
      .map((r) => {
        if (r.eq) return `<hp:run charPrIDRef="${baseCp}">${eqXml(r.text, this.charHeight)}<hp:t/></hp:run>`;
        const cp = this.hdr.charPr(baseCp, { u: !!(r.u || r.blank), b: !!r.b });
        const t = r.blank ? '          ' : r.text;
        return `<hp:run charPrIDRef="${cp}"><hp:t>${esc(t)}</hp:t></hp:run>`;
      })
      .join('');
  }

  para(paraPr, style, inner, extra = '') {
    return `<hp:p id="0" paraPrIDRef="${paraPr}" styleIDRef="${style}" pageBreak="0" columnBreak="0" merged="0"${extra}>${inner || `<hp:run charPrIDRef="${this.p.passage.charPr}"><hp:t/></hp:run>`}</hp:p>`;
  }

  textParas(text, role, paraPr = role.paraPr, style = role.style) {
    return paragraphs(text)
      .map((line) => this.para(paraPr, style, this.runs(line, role.charPr)))
      .join('');
  }

  spacer() {
    const s = this.p.spacer;
    return this.para(s.paraPr, s.style, `<hp:run charPrIDRef="${s.charPr}"><hp:t/></hp:run>`);
  }

  box(title, text) {
    const bf = this.hdr.boxBorder();
    const W = this.a.geometry.colWidth - 200;
    const P = this.p.passage;
    let inner = '';
    if (title) inner += this.para(this.centerPara, '0', this.runs(title, P.charPr));
    inner += paragraphs(text)
      .map((line) => this.para(this.boxPara, '0', this.runs(line, P.charPr)))
      .join('');
    const lines = paragraphs(text).reduce((n, l) => n + Math.max(1, Math.ceil(plain(l).length / 40)), title ? 1 : 0);
    const H = Math.max(1500, Math.round(lines * this.charHeight * 1.7) + 600);
    const tbl =
      `<hp:tbl id="${nextObjId()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="1" colCnt="1" cellSpacing="0" borderFillIDRef="${bf}" noAdjust="0">` +
      `<hp:sz width="${W}" widthRelTo="ABSOLUTE" height="${H}" heightRelTo="ABSOLUTE" protect="0"/>` +
      `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
      `<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="283" bottom="283"/>` +
      `<hp:tr><hp:tc name="" header="0" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="${bf}">` +
      `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${inner}</hp:subList>` +
      `<hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${W}" height="${H}"/>` +
      `<hp:cellMargin left="510" right="510" top="283" bottom="283"/></hp:tc></hp:tr></hp:tbl>`;
    return this.para(this.centerPara, '0', `<hp:run charPrIDRef="${P.charPr}">${tbl}<hp:t/></hp:run>`);
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
    const w = Math.min(maxW, pxW * 75);
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
    return this.para(this.centerPara, '0', `<hp:run charPrIDRef="${this.p.passage.charPr}">${pic}<hp:t/></hp:run>`);
  }

  write(doc) {
    const P = this.p;
    const nums = numberItems(doc.items);
    const xs = [];
    for (const it of doc.items) {
      if (it.kind === 'text') {
        xs.push(this.textParas(it.text, { ...P.group, charPr: this.hdr.charPr(P.group.charPr, { b: true }) }, this.groupPara));
        xs.push(this.spacer());
      } else if (it.kind === 'group') {
        if (it.instruction) xs.push(this.textParas(it.instruction, P.group, this.groupPara));
        if (it.passage) xs.push(this.textParas(it.passage, P.passage));
        if (it.figure) xs.push(this.figure(it.figure));
        xs.push(this.spacer());
      } else if (it.kind === 'question') {
        const label = nums.get(it.id)?.label ?? '';
        const lines = paragraphs(it.stem || '');
        const pts = it.points ? ` [${String(it.points).replace(/점$/, '')}점]` : '';
        lines[lines.length - 1] += pts;
        lines.forEach((line, i) => {
          const head = i === 0 && label ? `<hp:run charPrIDRef="${this.numberCp}"><hp:t>${esc(label)} </hp:t></hp:run>` : '';
          xs.push(this.para(this.stemPara, P.stem.style, head + this.runs(line, P.stem.charPr)));
        });
        if (it.passage) xs.push(this.textParas(it.passage, P.passage));
        if (it.figure) xs.push(this.figure(it.figure));
        if (it.box && (it.box.text || it.box.title)) xs.push(this.box(it.box.title, it.box.text));
        if (it.answerType === 'choice' && !(it.choices || []).some((c) => c.trim())) {
          // 지문 속 번호를 고르는 문항: 선지 번호만 한 줄로
          const marks = CHOICE_MARKS.slice(0, Math.max(5, it.choices?.length || 5)).join('      ');
          xs.push(this.para(P.choice.paraPr, P.choice.style, this.runs(marks, P.choice.charPr)));
        } else if (it.answerType === 'choice') {
          (it.choices || []).forEach((c, i) => {
            if (!c && i >= 5) return;
            xs.push(this.para(P.choice.paraPr, P.choice.style, this.runs(`${CHOICE_MARKS[i] ?? ''} ${c}`, P.choice.charPr)));
          });
        } else {
          const n = it.answerType === 'essay' ? 6 : 2;
          for (let i = 0; i < n; i++) xs.push(this.spacer());
        }
        xs.push(this.spacer());
      }
    }
    return xs.join('');
  }
}

/** 시험지 문서 → hwpx 바이트 */
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

  // 매니페스트: 쓰지 않는 BinData 정리 + 새 그림 등록
  let hpf = readText(pkg, 'Contents/content.hpf');
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
  const nums = numberItems(doc.items);
  return doc.items
    .map((it) =>
      it.kind === 'question'
        ? `${nums.get(it.id)?.label ?? ''} ${plain(it.stem)}`
        : plain(it.instruction || it.text || ''),
    )
    .join('\r\n');
}

/** 무거운 원본에서 본문을 걷어낸 가벼운 양식 파일 만들기 (내장 양식 제작용) */
export function stripToTemplate(pkg) {
  const analysis = analyzeTemplate(pkg);
  const bytes = buildHwpx(pkg, { title: '', items: [] }, { analysis });
  return { bytes, analysis };
}
