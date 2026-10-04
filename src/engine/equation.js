// 수식: LaTeX ↔ 한글 수식 스크립트, 그리고 한글에 넣을 수식 크기 어림
//
// 앱 안의 수식 표기는 $…$ 하나다. 그 안에는 두 가지 문법이 올 수 있다.
//   · LaTeX         \frac{1}{2}, \sqrt{x}, \mathrm{H_2O} …   (AI·kordoc·붙여넣기)
//   · 한글 수식 문법  {1} over {2}, sqrt {x}, rm H_2 O …        (hwpx 입력·직접 입력)
// hwpx 에는 한글 수식 문법으로, 미리보기(KaTeX)에는 LaTeX 로 바꿔 쓴다.
// 문법 사이 변환은 kordoc(MIT)의 검증된 변환기를 쓰고, 여기서는 그 앞뒤 손질만 한다.
import { latexLikeToEqEdit, hmlToLatex } from '../vendor/kordoc/equation.js';

/** 역슬래시 명령이 있으면 LaTeX 로 본다 */
export const isLatex = (s) => /\\(?:[A-Za-z]+|[{}|,;:!%#&$ ])/.test(String(s ?? ''));

// ── 화학식 \ce{…} (mhchem) → 로만체 첨자 표기 ──
function ceToLatex(body) {
  return String(body)
    .replace(/<=>|<->|⇌/g, ' \\rightleftharpoons ')
    .replace(/->|→/g, ' \\rightarrow ')
    .replace(/<-/g, ' \\leftarrow ')
    .split(/(\s+|\\[A-Za-z]+)/)
    .map((t) => {
      if (!t.trim() || t.startsWith('\\') || /^[+=]$/.test(t)) return t;
      // 계수(앞 숫자)는 그대로, 원소 뒤 숫자는 아래 첨자, 끝의 2+ · - 같은 전하는 위 첨자
      const m = /^(\d*)(.*?)(\^?\{?[0-9]*[+-]\}?)?$/.exec(t);
      const coef = m[1];
      let core = m[2].replace(/([A-Za-z)\]])(\d+)/g, '$1_{$2}');
      const charge = m[3] ? `^{${m[3].replace(/[\^{}]/g, '')}}` : '';
      return `${coef}\\mathrm{${core}${charge}}`;
    })
    .join('');
}

/** LaTeX 를 kordoc 변환기가 잘 다루는 모양으로 다듬는다 (한글·미리보기 공통 부분) */
function tidyLatex(s) {
  let t = String(s);
  t = t.replace(/\\ce\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, (_, b) => ceToLatex(b));
  return t
    .replace(/\\[dt]frac\b/g, '\\frac')
    .replace(/\\(?:displaystyle|textstyle|scriptstyle|limits|nolimits)\b/g, '')
    .replace(/\\(?:big|Big|bigg|Bigg)[lr]?\b/g, '')
    .replace(/\\operatorname\b/g, '\\mathrm')
    .replace(/\\(?:mathbf|boldsymbol|bm|mathit|mathsf|mathbb|mathcal)\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\degree\b/g, '^{\\circ}');
}

// 한글 수식 문법에 없는 기호 → 글자 그대로 (한글 수식은 유니코드 글자를 그대로 그린다).
// 가역 반응 ⇌ 은 한글 글꼴에서 너무 작게 나와 → 위에 ← 아래로 쌓는다.
const HWP_CHARS = {
  parallel: '∥', nparallel: '∦', rightleftharpoons: '~{->} atop {<-}~', leftrightharpoons: '~{<-} atop {->}~', square: '□', blacksquare: '■',
  checkmark: '✓', ell: 'ℓ', hbar: 'ℏ', angstrom: 'Å', mho: '℧', lt: '<', gt: '>', mid: '|', vert: '|', lvert: '|', rvert: '|',
};

/** $…$ 안의 글 → 한글 수식 스크립트 */
export function toHwpEquation(script) {
  const s = String(script ?? '').trim();
  if (!isLatex(s)) {
    // 한글 수식 문법(또는 명령 없는 짧은 LaTeX: x^2+bx). 한글은 ^·_ 뒤에 띄어 쓰지 않은 글자를
    // 모두 첨자로 묶으므로(x^2+bx → x^{2+bx}) 중괄호 없는 첨자는 숫자 한 덩이나 한 글자만 감싼다.
    return s
      .replace(/\\/g, '')
      .replace(/([_^])\s*(\d+(?:\.\d+)?|[A-Za-z]|[^\s{\d])/g, '$1{$2}')
      .replace(/\s+/g, ' ')
      .trim();
  }
  let t = tidyLatex(s)
    .replace(/\\(?:quad)\b/g, '\\;\\;')
    .replace(/\\qquad\b/g, '\\;\\;\\;\\;')
    .replace(/\\%/g, '%')
    .replace(/\\perp\b/g, '\\bot')
    .replace(/\\([A-Za-z]+)/g, (all, name) => (HWP_CHARS[name] ? ` ${HWP_CHARS[name]} ` : all));
  // 글자 그대로의 중괄호 \{ \} → LEFT { … RIGHT } (집합 기호)
  t = t.replace(/(\\left|\\right)?\\([{}])/g, (all, lr, b) => (lr ? all : b === '{' ? '\\left\\{' : '\\right\\}'));
  // 첨자가 든 로만체(\mathrm{H_2O}, \text{m/s^2}) → rm {H _{2} O} it  (따옴표로 묶으면 첨자가 글자로 나온다)
  const keep = [];
  t = t.replace(/\\(?:mathrm|textrm|text|rm)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, (all, body) => {
    // 한글·띄어 쓴 낱말은 따옴표 글자 그대로("넓이"), 영문·숫자·기호뿐이면 로만체(점 이름 A, 단위 m/s)
    if (/[^A-Za-z0-9.,:;/+\-−()'_^{}\s]/.test(body) || /\S\s+\S/.test(body.trim())) return all;
    keep.push(`rm {${latexLikeToEqEdit(body)}} it`);
    return ` QQRM${String.fromCharCode(65 + keep.length - 1)} `;
  });
  let out = latexLikeToEqEdit(t);
  out = out.replace(/QQRM([A-Z])/g, (_, k) => keep[k.charCodeAt(0) - 65]);
  return out.replace(/\s+/g, ' ').trim();
}

/** $…$ 안의 글 → 미리보기(KaTeX)용 LaTeX */
export function toLatex(script) {
  const s = String(script ?? '').trim();
  if (isLatex(s)) return tidyLatex(s);
  // 한글 수식 문법 → LaTeX. 소문자 예약어(le, ge, neq …)와 글꼴 전환(rm, it)도 받아 준다.
  const pre = s
    .replace(/\b(le|leq|ge|geq|neq|ne)\b/g, (w) => ({ le: 'LEQ', leq: 'LEQ', ge: 'GEQ', geq: 'GEQ', neq: '!=', ne: '!=' })[w]);
  return hmlToLatex(pre)
    .replace(/(^|[\s{])rm(?=\s)/g, '$1\\rm')
    .replace(/(^|[\s{])it(?=\s|$)/g, '$1\\it');
}

// ───────────── 크기 어림 (한글은 열 때 수식 상자 크기를 다시 재지 않는다) ─────────────
// 글자 높이(em) 1 을 기준으로 {w 너비, up 기준선 위, dn 기준선 아래}
const ROW = { up: 0.86, dn: 0.35 };
const BIG_OPS = new Set(['sum', 'prod', 'coprod', 'int', 'oint', 'dint', 'tint', 'odint', 'otint', 'lim', 'Lim', 'INTER', 'UNION', 'SMALLSUM', 'SMALLPROD', 'BIGCUP', 'BIGCAP']);
const STACKED = new Set(['sum', 'prod', 'coprod', 'lim', 'Lim', 'INTER', 'UNION', 'BIGCUP', 'BIGCAP']);
const ACCENTS = new Set(['vec', 'bar', 'hat', 'dot', 'ddot', 'tilde', 'under', 'dyad', 'acute', 'grave', 'check', 'arch']);
const MATRICES = new Set(['matrix', 'pmatrix', 'bmatrix', 'dmatrix', 'cases', 'eqalign']);
const FONT = new Set(['rm', 'it', 'bold']);
const FUNCS = /^(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh|log|ln|exp|det|gcd|mod|max|min|arg|deg|lim)$/;
const OPS = /^(TIMES|times|DIV|LEQ|GEQ|le|ge|leq|geq|ne|neq|APPROX|SIM|SIMEQ|CONG|EQUIV|PROPTO|IN|NOTIN|SUBSET|SUPERSET|SUBSETEQ|SUPSETEQ|CUP|SMALLINTER|BOT|THEREFORE|BECAUSE|RARROW|LARROW|LRARROW|larrow|rarrow|uparrow|downarrow|OPLUS|OTIMES|CDOT|cdot|CIRC|AST|BULLET|FORALL|EXIST)$/;

function tokenize(s) {
  const out = [];
  const re = /"[^"]*"|[A-Za-z]+|\d+(?:\.\d+)?|->|<-|<=|>=|!=|==|\+-|-\+|\S/g;
  let m;
  while ((m = re.exec(s))) out.push(m[0]);
  return out;
}

// 한글 수식 글꼴(기울인 영문) 기준 대략 너비 — 모자라면 다음 글자와 겹치므로 넉넉히 잡는다
function charW(ch) {
  if (/[가-힣ㄱ-ㅎ一-鿿]/.test(ch)) return 1.0;
  if (/[A-Z]/.test(ch)) return 0.74;
  if (/[a-z]/.test(ch)) return 0.58;
  if (/\d/.test(ch)) return 0.55;
  if (/[⇌⇋]/.test(ch)) return 1.6;
  if (/[+\-=<>±×÷→←∥≤≥≠]/.test(ch)) return 1.15;
  if (/[()[\]|]/.test(ch)) return 0.42;
  if (/[,.;:'!]/.test(ch)) return 0.35;
  return 0.66;
}

// 한글 수식의 기호 낱말 (대문자 낱말이라도 이 목록에 없으면 AB, ABC 같은 변수 이름으로 본다)
const SYMBOL_WORDS = /^(alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|GAMMA|DELTA|THETA|LAMBDA|XI|PI|SIGMA|UPSILON|PHI|PSI|OMEGA|INF|CDOTS|LDOTS|VDOTS|DDOTS|ANGLE|TRIANGLE|DEG|CIRC|EMPTYSET|NABLA|Partial|prime|AST|BULLET)$/;

const box = (w, up = ROW.up, dn = ROW.dn) => ({ w, up, dn });
const h = (b) => b.up + b.dn;

/** 한글 수식 스크립트 → 상자 크기(em) */
export function measureEquation(script) {
  const toks = tokenize(String(script ?? ''));
  let i = 0;

  // { … } 한 묶음 또는 다음 한 단위
  const operand = () => {
    if (toks[i] === '{') {
      i++;
      const b = seq('}');
      i++;
      return b;
    }
    return atom();
  };

  // 행렬류 본문: # 은 줄, & 는 칸
  const grid = () => {
    if (toks[i] !== '{') return box(1);
    i++;
    const rows = [[[]]];
    let depth = 0;
    for (; i < toks.length; i++) {
      const t = toks[i];
      if (t === '{') depth++;
      if (t === '}') { if (!depth) break; depth--; }
      if (!depth && t === '#') { rows.push([[]]); continue; }
      if (!depth && t === '&') { rows[rows.length - 1].push([]); continue; }
      rows[rows.length - 1][rows[rows.length - 1].length - 1].push(t);
    }
    i++;
    const cells = rows.map((r) => r.map((c) => measureEquation(c.join(' '))));
    const cols = Math.max(...cells.map((r) => r.length));
    const colW = Array.from({ length: cols }, (_, k) => Math.max(0, ...cells.map((r) => r[k]?.w ?? 0)));
    const rowH = cells.map((r) => Math.max(...r.map(h)));
    const H = rowH.reduce((a, b) => a + b, 0) + 0.25 * (rows.length - 1);
    return box(colW.reduce((a, b) => a + b, 0) + 0.9 * (cols - 1), H / 2 + 0.3, H / 2 - 0.3 + 0.05);
  };

  function atom() {
    const t = toks[i++];
    if (t == null) return box(0, 0, 0);
    if (t.startsWith('"')) return box([...t.slice(1, -1)].reduce((a, c) => a + charW(c), 0));
    if (t === '`') return box(0.17, 0, 0);
    if (t === '~') return box(0.33, 0, 0);
    if (t === 'rm' && toks[i] === '{') {
      // 로만체(화학식·단위)는 기울인 글자보다 좁다
      const x = operand();
      return box(x.w * 0.86, x.up, x.dn);
    }
    if (FONT.has(t)) return box(0, 0, 0);
    if (t === 'LEFT' || t === 'RIGHT') {
      i++; // 괄호 글자
      return box(0.4, 0, 0);
    }
    if (t === 'sqrt') {
      const x = operand();
      return box(x.w + 0.85, x.up + 0.2, x.dn);
    }
    if (t === 'root') {
      const n = operand();
      if (toks[i] === 'of') i++;
      const x = operand();
      return box(x.w + 0.85 + Math.max(0, n.w * 0.6 - 0.4), Math.max(x.up + 0.2, 0.45 + h(n) * 0.6), x.dn);
    }
    if (ACCENTS.has(t)) {
      const x = operand();
      return box(x.w, x.up + 0.3, x.dn);
    }
    if (MATRICES.has(t)) {
      const g = grid();
      const extra = t === 'matrix' || t === 'eqalign' ? 0 : t === 'cases' ? 0.6 : 0.8;
      return box(g.w + extra, g.up, g.dn);
    }
    if (BIG_OPS.has(t)) return { ...box(t === 'lim' || t === 'Lim' ? 1.1 : 1.15, 1.0, 0.45), big: STACKED.has(t) };
    if (FUNCS.test(t)) return box(t.length * 0.5 + 0.15);
    if (OPS.test(t) || /^(->|<-|<=|>=|!=|==|\+-|-\+)$/.test(t)) return box(1.2);
    if (SYMBOL_WORDS.test(t)) return box(t === 'CDOTS' || t === 'LDOTS' ? 1.1 : 0.72);
    if (t === '{') { i--; return operand(); }
    return box([...t].reduce((a, c) => a + charW(c), 0));
  }

  function seq(end) {
    const items = [];
    while (i < toks.length && toks[i] !== end) {
      const t = toks[i];
      if (t === '}' ) break;
      if ((t === 'over' || t === 'atop') && items.length) {
        i++;
        const num = items.pop();
        const den = operand();
        items.push(box(Math.max(num.w, den.w) + 0.3, 0.3 + 0.12 + h(num), h(den) + 0.12 - 0.3));
        continue;
      }
      if ((t === '^' || t === '_') && items.length) {
        i++;
        const s = operand();
        const b = items[items.length - 1];
        const sh = h(s) * 0.7;
        if (b.big) {
          // 합·곱·극한의 위아래 첨자는 위아래로 쌓인다
          b.w = Math.max(b.w, s.w * 0.7);
          if (t === '^') b.up += sh + 0.1;
          else b.dn += sh + 0.1;
        } else {
          // 위 첨자는 기준선을 약 0.4 올리고, 아래 첨자는 약 0.22 내린 70% 크기 글자
          b.w += s.w * 0.7 + 0.05;
          if (t === '^') b.up = Math.max(b.up, 0.4 + s.up * 0.7);
          else b.dn = Math.max(b.dn, 0.22 + s.dn * 0.7);
        }
        continue;
      }
      if (t === '#' && end == null) {
        // 여러 줄 수식: 줄마다 따로 재서 쌓는다
        i++;
        const rest = seq(end);
        const cur = join(items);
        return box(Math.max(cur.w, rest.w), cur.up, cur.dn + 0.25 + h(rest));
      }
      items.push(atom());
    }
    return join(items);
  }

  const join = (items) =>
    items.length
      ? items.reduce((a, b) => box(a.w + b.w, Math.max(a.up, b.up), Math.max(a.dn, b.dn)), box(0, ROW.up, ROW.dn))
      : box(0.5);

  const b = seq(null);
  return { w: Math.max(0.6, b.w * 1.1 + 0.2), up: b.up, dn: b.dn };
}
