// 시험지 지면 조판기 (미리보기 = PDF 인쇄본)
// hwpx 양식에서 읽은 쪽 크기·여백·단 수를 그대로 쓰고, 문항을 '조판 단위'로 잘라
// 단→쪽 순으로 채운다. 넘치면 다음 쪽, 긴 문단은 문장 경계에서 나눈다.
import { escapeHtml as esc, inlineHtml, paragraphs } from '../engine/markup.js';
import { CHOICE_MARKS, numberItems } from '../model.js';

const MM = 283.465; // HWPUNIT per mm

/** 문서 → 조판 단위 목록 [{html, cls, keepNext, split}] */
export function buildUnits(doc) {
  const nums = numberItems(doc.items);
  const U = [];
  const para = (cls, text, id) => paragraphs(text).filter((l) => l.trim() !== '' || cls === 'u-para').forEach((l) =>
    U.push({ cls, html: inlineHtml(l), id, split: cls === 'u-para' }),
  );
  for (const it of doc.items) {
    if (it.kind === 'text') {
      U.push({ cls: 'u-section', html: inlineHtml(it.text), id: it.id, keepNext: true });
    } else if (it.kind === 'group') {
      if (it.instruction) U.push({ cls: 'u-group', html: inlineHtml(it.instruction), id: it.id, keepNext: true });
      if (it.passage) para('u-para u-gpara', it.passage, it.id);
      if (it.figure?.src) U.push({ cls: 'u-fig', html: `<img src="${it.figure.src}" alt="">`, id: it.id });
      U.push({ cls: 'u-gap', html: '', id: it.id });
    } else if (it.kind === 'question') {
      const label = nums.get(it.id)?.label ?? '';
      const lines = paragraphs(it.stem || '');
      const pts = it.points ? ` <span class="pts">[${esc(String(it.points).replace(/점$/, ''))}점]</span>` : '';
      U.push({
        cls: 'u-stem',
        id: it.id,
        keepNext: true,
        html: `<span class="num">${esc(label)}</span> <span class="stx">${lines.map(inlineHtml).join('<br>')}${pts}</span>`,
      });
      if (it.passage) para('u-para', it.passage, it.id);
      if (it.figure?.src) U.push({ cls: 'u-fig', html: `<img src="${it.figure.src}" alt="">`, id: it.id });
      if (it.box && (it.box.text || it.box.title)) {
        U.push({
          cls: 'u-box',
          id: it.id,
          html: (it.box.title ? `<div class="bt">${inlineHtml(it.box.title)}</div>` : '') +
            paragraphs(it.box.text).map((l) => `<div class="bp">${inlineHtml(l)}</div>`).join(''),
        });
      }
      if (it.answerType === 'choice') {
        const cs = it.choices || [];
        if (!cs.some((c) => c.trim())) {
          U.push({ cls: 'u-choices row', id: it.id, html: CHOICE_MARKS.slice(0, Math.max(5, cs.length)).map((m) => `<span>${m}</span>`).join('') });
        } else {
          const short = cs.every((c) => c.replace(/[_*$]/g, '').length <= 9);
          U.push({
            cls: `u-choices${short ? ' grid' : ''}`,
            id: it.id,
            html: cs.map((c, i) => `<div class="ch"><span class="cm">${CHOICE_MARKS[i] ?? ''}</span><span>${inlineHtml(c)}</span></div>`).join(''),
          });
        }
      } else {
        U.push({ cls: `u-answer ${it.answerType}`, id: it.id, html: '' });
      }
      U.push({ cls: 'u-gap', html: '', id: it.id });
    }
  }
  return U;
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
function headerHtml(theme, T) {
  const t = (i, d = '') => esc(T[i] ?? d);
  if (theme === 'wonmook') {
    return `<div class="hd-wm"><table><tr>
      <td class="c1"><div class="s">${t(0)}</div><div class="b">${t(1)}</div><div class="s">${t(2)}</div></td>
      <td class="c2"><div class="b">${t(3)}</div><div class="b">${t(4)}</div></td>
      <td class="c3"><div class="b">${t(5)}</div><div class="m">${t(8)}</div></td>
      <td class="c4"><div>${t(9)}</div><div>${t(10)}</div><div>${t(11)}</div></td></tr></table>
      <div class="notice">${t(12)}</div></div>`;
  }
  if (theme === 'suneung') {
    return `<div class="hd-sn"><div class="ttl">${t(0)}</div>
      <div class="row"><span class="oval">${t(5)}</span><span class="area">${t(1)}</span><span class="type">홀수형</span></div><div class="rule"></div></div>`;
  }
  const lines = T.slice(0, 4).filter(Boolean);
  return `<div class="hd-gen">${lines.map((l, i) => `<div class="${i === 0 ? 'b' : ''}">${esc(l)}</div>`).join('')}</div>`;
}

function runningHead(theme, T, n) {
  if (theme === 'suneung') return `<div class="rh-sn ${n % 2 ? 'odd' : 'even'}"><span>${esc((n % 2 ? T[4] : T[3]) ?? '')}</span></div>`;
  return '';
}

function footerHtml(theme, T, n, total, last) {
  if (theme === 'wonmook') {
    return `${last ? '' : `<div class="cont">${esc(T[n % 2 ? 14 : 13] ?? '다음 면에 계속됩니다.')}</div>`}
      <div class="ft-wm"><span>${esc(T[6] ?? '')}${n}${esc((T[7] ?? '').replace(/\(\s*\d+\s*\)면/, `( ${total} )면`))}</span></div>`;
  }
  if (theme === 'suneung') return `<div class="ft-sn"><span class="pn">${n}</span><span class="tot">${total}</span></div>`;
  return `<div class="ft-gen">${n} / ${total}</div>`;
}

/**
 * 조판 실행: host 안에 쪽들을 만든다.
 * @param {HTMLElement} host
 * @param {{doc, geometry, theme, headerTexts:string[]}} o
 * @returns {number} 쪽 수
 */
export async function layout(host, { doc, geometry, theme, headerTexts }) {
  if (document.fonts?.ready) await document.fonts.ready;
  const S = pageSpec(geometry);
  host.innerHTML = '';
  host.style.setProperty('--pw', `${S.w}mm`);
  host.style.setProperty('--ph', `${S.h}mm`);
  host.className = `paper-host theme-${theme}`;
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
