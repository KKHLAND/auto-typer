// 학습자료 지면 조판기 (미리보기 = PDF 인쇄본)
// hwpx 양식에서 읽은 쪽 크기·여백·단 수와 역할별 글꼴·크기·들여쓰기를 그대로 쓰고,
// 블록을 '조판 단위'로 잘라 단→쪽 순으로 채운다. 넘치면 다음 쪽, 긴 문단은 문장 경계에서 나눈다.
import { escapeHtml as esc, inlineHtml, paragraphs } from '../engine/markup.js';

const MM = 283.465; // HWPUNIT per mm

/** 문서 → 조판 단위 목록 [{html, cls, keepNext, split}] */
export function buildUnits(doc) {
  const U = [];
  for (const b of doc.blocks || []) {
    const id = b.id;
    switch (b.type) {
      case 'title':
        // 두 번째 자료 제목부터는 새 쪽에서 (hwpx 와 같게)
        U.push({ cls: 'u-title', html: inlineHtml(b.text), id, keepNext: true, pageBreak: U.length > 0 });
        break;
      case 'heading': {
        const lv = Math.min(3, Math.max(1, b.level || 1));
        paragraphs(b.text).forEach((l) => U.push({ cls: `u-h u-h${lv}`, html: inlineHtml(l), id, keepNext: true }));
        break;
      }
      case 'list': {
        const lv = Math.min(3, Math.max(1, b.level || 1));
        paragraphs(b.text).forEach((l) => U.push({ cls: `u-list u-l${lv}`, html: inlineHtml(l), id }));
        break;
      }
      case 'box':
        U.push({
          cls: 'u-box',
          id,
          html: (b.title ? `<div class="bt">${inlineHtml(b.title)}</div>` : '') +
            paragraphs(b.text).map((l) => `<div class="bp">${inlineHtml(l)}</div>`).join(''),
        });
        break;
      case 'table': {
        const rows = b.rows || [];
        const head = rows.length > 1;
        U.push({
          cls: 'u-table',
          id,
          html:
            `<table>${rows
              .map((r, ri) => `<tr>${r.map((c) => `<${ri === 0 && head ? 'th' : 'td'}>${paragraphs(c).map(inlineHtml).join('<br>')}</${ri === 0 && head ? 'th' : 'td'}>`).join('')}</tr>`)
              .join('')}</table>` + (b.text ? `<div class="cap">${inlineHtml(b.text)}</div>` : ''),
        });
        break;
      }
      case 'figure':
        if (b.figure?.src) U.push({ cls: 'u-fig', html: `<img src="${b.figure.src}" alt="">` + (b.text ? `<div class="cap">${inlineHtml(b.text)}</div>` : ''), id });
        break;
      default:
        paragraphs(b.text).forEach((l) => l.trim() && U.push({ cls: 'u-para', html: inlineHtml(l), id, split: true }));
    }
  }
  return U;
}

/** 양식의 역할별 서식(analysis.css) → 지면 CSS 변수 */
export function roleVars(css) {
  const vars = {};
  if (!css) return vars;
  const ALIGN = { JUSTIFY: 'justify', DISTRIBUTE: 'justify', LEFT: 'left', RIGHT: 'right', CENTER: 'center' };
  for (const [role, r] of Object.entries(css)) {
    const sans = /고딕|돋움|굴림|sans|Gothic|Dotum/i.test(r.face || '');
    const fallback = sans ? "'Noto Sans KR', sans-serif" : "'Noto Serif KR', serif";
    vars[`--${role}-face`] = r.face ? `'${r.face}', ${fallback}` : fallback;
    vars[`--${role}-size`] = `${r.size}pt`;
    vars[`--${role}-weight`] = r.bold ? 700 : 400;
    vars[`--${role}-align`] = ALIGN[r.align] || 'justify';
    // hwp 의 들여쓰기(+)/내어쓰기(−)를 CSS 로: 내어쓰기면 둘째 줄부터 그만큼 더 들어간다
    vars[`--${role}-ti`] = `${r.indent}pt`;
    vars[`--${role}-pad`] = `${r.left + Math.max(0, -r.indent)}pt`;
    vars[`--${role}-line`] = (r.line || 160) / 100;
    vars[`--${role}-prev`] = `${r.prev || 0}pt`;
    vars[`--${role}-next`] = `${r.next || 0}pt`;
  }
  return vars;
}

/** 양식 분석의 형상 → mm */
export function pageSpec(geometry) {
  const g = geometry;
  return {
    w: g.width / MM,
    h: g.height / MM,
    ml: g.margin.left / MM,
    mr: g.margin.right / MM,
    mt: (g.margin.top + g.margin.header) / MM / 1.35,
    mb: (g.margin.bottom + g.margin.footer) / MM / 1.35,
    cols: g.cols,
    gap: g.gap / MM,
  };
}

// ── 테마별 머리·꼬리 ──
// sample: 머리 문구 = [쪽 번호 앞, 쪽 번호 뒤, 학교명, 학습 자료명, 학번·이름(한 줄)]
function headerHtml(theme, T) {
  const t = (i, d = '') => esc(T[i] ?? d);
  if (theme === 'sample') {
    return `<div class="hd-sp"><div class="l">${t(2)}</div><div class="c">${t(3)}</div><div class="r">${t(4)}</div></div>`;
  }
  const lines = T.slice(0, 4).filter(Boolean);
  return `<div class="hd-gen">${lines.map((l, i) => `<div class="${i === 0 ? 'b' : ''}">${esc(l)}</div>`).join('')}</div>`;
}

function runningHead() {
  return '';
}

function footerHtml(theme, T, n, total) {
  if (theme === 'sample') return `<div class="ft-gen">${esc(T[0] ?? '- ')}${n}${esc(T[1] ?? ' -')}</div>`;
  return `<div class="ft-gen">${n} / ${total}</div>`;
}

/**
 * 조판 실행: host 안에 쪽들을 만든다.
 * @param {HTMLElement} host
 * @param {{doc, geometry, theme, headerTexts:string[]}} o
 * @returns {number} 쪽 수
 */
export async function layout(host, { doc, geometry, theme, headerTexts, css }) {
  if (document.fonts?.ready) await document.fonts.ready;
  const S = pageSpec(geometry);
  host.innerHTML = '';
  host.style.setProperty('--pw', `${S.w}mm`);
  host.style.setProperty('--ph', `${S.h}mm`);
  host.className = `paper-host theme-${theme}`;
  for (const [k, v] of Object.entries(roleVars(css))) host.style.setProperty(k, String(v));
  const units = buildUnits(doc);
  const pages = [];

  const newPage = () => {
    const n = pages.length + 1;
    const pg = document.createElement('section');
    pg.className = 'page';
    pg.style.cssText = `width:${S.w}mm;height:${S.h}mm;padding:${S.mt}mm ${S.mr}mm ${S.mb}mm ${S.ml}mm`;
    pg.innerHTML = `${runningHead(theme, headerTexts, n)}${n === 1 ? headerHtml(theme, headerTexts) : ''}<div class="body"></div><div class="foot"></div>`;
    const body = pg.querySelector('.body');
    host.appendChild(pg);
    // 단 채우기(column-fill:auto)는 명시적 높이가 있어야 왼쪽 단→오른쪽 단으로 흐른다
    const cs = getComputedStyle(pg);
    let h = pg.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    for (const ch of pg.children) if (ch !== body) h -= ch.offsetHeight + parseFloat(getComputedStyle(ch).marginTop) + parseFloat(getComputedStyle(ch).marginBottom);
    body.style.cssText = `column-count:${S.cols};column-gap:${S.gap}mm;height:${Math.floor(h)}px;flex:none`;
    pages.push(pg);
    return body;
  };
  const overflow = (body) => body.scrollWidth > body.clientWidth + 2 || body.scrollHeight > body.clientHeight + 2;
  const make = (u) => {
    const el = document.createElement('div');
    el.className = `u ${u.cls}`;
    el.dataset.id = u.id;
    el.innerHTML = u.html;
    return el;
  };

  let body = newPage();
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u.pageBreak && body.children.length) body = newPage();
    const group = [u];
    // 발문·지시문은 다음 단위와 함께 (단 맨 아래 홀로 남지 않게)
    let j = i;
    while (units[j]?.keepNext && units[j + 1]) group.push(units[++j]);
    const els = group.map(make);
    els.forEach((e) => body.appendChild(e));
    if (!overflow(body)) {
      i = j;
      continue;
    }
    els.forEach((e) => e.remove());
    const empty = !body.children.length;
    // 긴 지문 문단은 문장 경계에서 쪼개 남는 자리를 채운다
    if (group.length === 1 && u.split) {
      const rest = splitToFit(body, u, make, overflow);
      if (rest !== u) {
        body = newPage();
        units.splice(i + 1, 0, rest);
        continue;
      }
    }
    if (empty) {
      // 빈 쪽에도 안 들어가는 거대한 단위: 그대로 두고 넘어간다(잘림)
      els.forEach((e) => body.appendChild(e));
      i = j;
      body = newPage();
      continue;
    }
    body = newPage();
    i--; // 새 쪽에서 다시
  }
  // 빈 마지막 쪽 정리
  if (pages.length > 1 && !pages[pages.length - 1].querySelector('.body').children.length) {
    pages.pop().remove();
  }
  pages.forEach((pg, k) => {
    pg.querySelector('.foot').innerHTML = footerHtml(theme, headerTexts, k + 1, pages.length, k === pages.length - 1);
  });
  return pages.length;
}

function splitToFit(body, u, make, overflow) {
  const text = u.html;
  // 태그 바깥의 문장 끝(. ? ! 다.) 뒤 공백 위치
  const cuts = [];
  let depth = 0;
  for (let k = 0; k < text.length; k++) {
    const c = text[k];
    if (c === '<') depth++;
    else if (c === '>') depth--;
    else if (!depth && c === ' ' && /[.?!。]$/.test(text.slice(0, k))) cuts.push(k);
  }
  let best = -1;
  for (let lo = 0, hi = cuts.length - 1; lo <= hi; ) {
    const mid = (lo + hi) >> 1;
    const el = make({ ...u, html: text.slice(0, cuts[mid]) });
    body.appendChild(el);
    const bad = overflow(body);
    el.remove();
    if (bad) hi = mid - 1;
    else {
      best = mid;
      lo = mid + 1;
    }
  }
  if (best < 0) return u;
  body.appendChild(make({ ...u, html: text.slice(0, cuts[best]) }));
  return { ...u, cls: u.cls + ' u-cont', html: text.slice(cuts[best] + 1) };
}

/** 인쇄(=PDF 저장): 조판된 쪽을 인쇄 전용 영역에 복사해 브라우저 인쇄 */
export function printPages(host, geometry) {
  const S = pageSpec(geometry);
  let root = document.getElementById('print-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'print-root';
    document.body.appendChild(root);
  }
  root.innerHTML = '';
  const clone = host.cloneNode(true);
  clone.removeAttribute('id');
  root.appendChild(clone);
  let st = document.getElementById('print-page-size');
  if (!st) {
    st = document.createElement('style');
    st.id = 'print-page-size';
    document.head.appendChild(st);
  }
  st.textContent = `@page { size: ${S.w}mm ${S.h}mm; margin: 0 }`;
  document.body.classList.add('printing');
  const done = () => {
    document.body.classList.remove('printing');
    root.innerHTML = '';
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 50);
}
