// 문항 텍스트 안의 인라인 서식 표기.
// 편집기·AI·파서·hwpx 작성기·미리보기가 모두 이 한 가지 표기를 공유한다.
//
//   __밑줄__     **굵게**     $수식$ (한글 수식 스크립트)     [빈칸]
//
// 줄바꿈(\n)은 문단 구분이다.

const TOKEN = /(__[^_\n]+?__|\*\*[^*\n]+?\*\*|\$[^$\n]+?\$|\[빈칸\])/g;

/** 한 줄(문단)을 run 배열로 쪼갠다: {text, u, b, eq, blank} */
export function parseInline(line) {
  const runs = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    if (m.index > last) runs.push({ text: line.slice(last, m.index) });
    const tok = m[0];
    if (tok === '[빈칸]') runs.push({ text: '', blank: true });
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
  return String(text ?? '')
    .replace(/__([^_\n]+?)__/g, '$1')
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/\$([^$\n]+?)\$/g, '$1')
    .replace(/\[빈칸\]/g, '(    )');
}

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
      return h;
    })
    .join('');
}
