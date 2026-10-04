// 문항 텍스트 안의 인라인 서식 표기.
// 편집기·AI·파서·hwpx 작성기·미리보기가 모두 이 한 가지 표기를 공유한다.
//
//   __밑줄__     **굵게**     $수식$ (한글 수식 스크립트)     [빈칸]
//   ⟪추정⟫  흐린 손글씨를 AI 가 맥락으로 짐작해 채운 낱말 — 편집·미리보기에서만 노란 표시, hwpx·PDF 에는 글자만
//
// 줄바꿈(\n)은 문단 구분이다.

// 수식 $…$: 여는 $ 바로 뒤와 닫는 $ 바로 앞에 공백이 없고, 닫는 $ 뒤에 숫자가 오지 않을 때만
// (pandoc 규칙) — "$40 ② $50" 같은 달러 금액이 수식으로 잘못 묶이지 않게
const TOKEN = /(⟪[^⟪⟫\n]+⟫|__[^_\n]+?__|\*\*[^*\n]+?\*\*|\$(?=\S)[^$\n]*?\S\$(?!\d)|\$\S\$(?!\d)|\[빈칸\])/g;

/** 한 줄(문단)을 run 배열로 쪼갠다: {text, u, b, eq, blank, guess} */
export function parseInline(line) {
  const runs = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    if (m.index > last) runs.push({ text: line.slice(last, m.index) });
    const tok = m[0];
    if (tok === '[빈칸]') runs.push({ text: '', blank: true });
    else if (tok.startsWith('⟪')) runs.push(...nested(tok.slice(1, -1), { guess: true }));
    else if (tok.startsWith('__')) runs.push(...nested(tok.slice(2, -2), { u: true }));
    else if (tok.startsWith('**')) runs.push(...nested(tok.slice(2, -2), { b: true }));
    else runs.push({ text: tok.slice(1, -1), eq: true });
    last = m.index + tok.length;
  }
  if (last < line.length) runs.push({ text: line.slice(last) });
  return runs.filter((r) => r.text !== '' || r.blank);
}

// __**굵은 밑줄**__ 같은 한 단계 중첩만 허용
function nested(inner, flag) {
  return parseInline(inner).map((r) => ({ ...r, ...flag }));
}

/** 문단 배열 */
export function paragraphs(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
}

/** 서식 표기를 지운 순수 텍스트 */
export function plain(text) {
  // parseInline 과 같은 규칙으로 — "$40 ② $50" 같은 금액의 $ 는 지우지 않는다
  return paragraphs(text)
    .map((line) => parseInline(line).map((r) => (r.blank ? '(    )' : r.text)).join(''))
    .join('\n');
}

/** 추정 표시(⟪ ⟫)만 지운다 — 선생님이 확인을 마친 뒤 */
export const clearGuesses = (text) => String(text ?? '').replace(/[⟪⟫]/g, '');
export const hasGuess = (text) => /⟪[^⟫]*⟫/.test(String(text ?? ''));

export function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/** 한글 수식 스크립트 → 간단한 HTML (미리보기용 근사) */
export function eqHtml(script) {
  const grp = String.raw`(\{(?:[^{}]|\{[^{}]*\})*\}|[^\s{}^_]+)`;
  const un = (g) => (g.startsWith('{') ? g.slice(1, -1) : g);
  let s = escapeHtml(script)
    .replace(/\b(LEFT|RIGHT|left|right)\b/g, '')
    .replace(/\btimes\b/g, '×').replace(/\bcdot\b/g, '·').replace(/\ble\b|\bleq\b/g, '≤').replace(/\bge\b|\bgeq\b/g, '≥')
    .replace(/\bneq\b|\bne\b/g, '≠').replace(/\bpi\b/g, 'π').replace(/\btheta\b/g, 'θ').replace(/\balpha\b/g, 'α').replace(/\bbeta\b/g, 'β')
    .replace(/\binf\b|\binfinity\b/g, '∞').replace(/-&gt;|\brarrow\b/g, '→').replace(/\bsum\b/g, '∑').replace(/\bint\b/g, '∫').replace(/\blim\b/g, 'lim');
  for (let k = 0; k < 3; k++) {
    s = s.replace(new RegExp(`${grp}\\s*over\\s*${grp}`, 'g'), (_, a, b) => `<span class="frac"><span>${un(a)}</span><span>${un(b)}</span></span>`);
    s = s.replace(new RegExp(`sqrt\\s*${grp}`, 'g'), (_, a) => `√<span class="ov">${un(a)}</span>`);
    s = s.replace(new RegExp(`\\^\\s*${grp}`, 'g'), (_, a) => `<sup>${un(a)}</sup>`);
    s = s.replace(new RegExp(`_\\s*${grp}`, 'g'), (_, a) => `<sub>${un(a)}</sub>`);
  }
  return s.replace(/[{}`~]/g, '').replace(/\s+/g, ' ');
}

/** 미리보기용 HTML (한 문단) */
export function inlineHtml(line) {
  return parseInline(line)
    .map((r) => {
      if (r.blank) return '<span class="blank">&#8195;&#8195;&#8195;&#8195;&#8195;</span>';
      let h = r.eq ? `<span class="eq">${eqHtml(r.text)}</span>` : escapeHtml(r.text);
      if (r.b) h = `<b>${h}</b>`;
      if (r.u) h = `<u>${h}</u>`;
      if (r.guess) h = `<mark class="guess" title="AI가 맥락으로 추정한 글자 — 확인해 주세요">${h}</mark>`;
      return h;
    })
    .join('');
}
