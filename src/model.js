// 학습자료 문서 모델 (study-doc/v2)
//
// 원칙: 읽은 내용을 '그대로' 옮긴다. 번호·기호·배점 같은 글자는 원문에 있는 그대로 text 안에 둔다.
// 앱은 내용을 고치거나 번호를 새로 매기지 않고, 블록의 '종류'만 정해 양식의 서식을 입힌다.
//
// doc = { schema, title, templateId, headerEdits:{[templateId]:{[key]:text}}, blocks:[...] }
//
// block.type
//   'title'      자료 제목(한 줄)
//   'heading'    소제목            { level: 1|2|3 }
//   'paragraph'  본문 문단          (text 안의 줄바꿈 = 문단 나눔)
//   'list'       목록 한 항목       { level: 1|2|3 }  — 번호·기호(1. ① • 가.)는 text 맨 앞에 원문 그대로
//   'box'        상자(보기·참고·요약) { title }
//   'table'      표                { rows: string[][] }  첫 행 = 머리 행
//   'figure'     그림              { figure:{src,w,h}, text = 설명(선택) }
//
// 공통: id, text, flag('todo'|'check'|'done'), page(원본 쪽, 0부터)
// 텍스트는 markup.js 의 인라인 표기(__밑줄__ **굵게** $수식$ [빈칸])를 쓴다.

export const BLOCK_TYPES = ['title', 'heading', 'paragraph', 'list', 'box', 'table', 'figure'];

export const TYPE_LABEL = {
  title: '자료 제목',
  heading: '소제목',
  paragraph: '문단',
  list: '목록',
  box: '상자',
  table: '표',
  figure: '그림',
};

let seq = 0;
export const uid = () => `b${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function newDoc(title = '새 학습자료') {
  return { schema: 'study-doc/v2', title, templateId: 'sample', headerEdits: {}, blocks: [] };
}

export function newBlock(type = 'paragraph', p = {}) {
  const b = { id: uid(), type, text: '', flag: 'todo', ...p };
  if (type === 'heading' || type === 'list') b.level = clampLevel(b.level);
  if (type === 'box') b.title = b.title ?? '';
  if (type === 'table') b.rows = Array.isArray(b.rows) && b.rows.length ? b.rows : [['', ''], ['', '']];
  if (type === 'figure') b.figure = b.figure ?? null;
  return b;
}

const clampLevel = (n) => Math.min(3, Math.max(1, Math.round(+n || 1)));

/**
 * AI·규칙 파서가 낸 블록 → 문서 블록.
 *   {type, text, level?, title?, rows?, figure?, cont?, uncertain?, page?}
 * cont=true 인 문단·목록·상자는 앞 블록(앞쪽에서 넘어온 같은 글)에 이어 붙인다.
 */
// AI 가 가끔 내는 LaTeX 기호 하나짜리 수식($\rightarrow$ 등)은 그냥 글자로
const LATEX_SYMBOL = {
  rightarrow: '→', to: '→', leftarrow: '←', leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔',
  times: '×', cdot: '·', div: '÷', pm: '±', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', circ: '○', triangle: '△',
};
// 기호 하나뿐인 수식($\times$)은 글자로, 수식 밖에 새어 나온 \rightarrow 도 글자로. 수식 안은 그대로 둔다.
export const fixSymbols = (s) =>
  String(s ?? '')
    .split(/(\$(?=\S)[^$\n]*?\S\$(?!\d)|\$\S\$(?!\d))/)
    .map((part, k) =>
      k % 2
        ? part.replace(/^\$\s*\\([A-Za-z]+)\s*\$$/, (all, a) => LATEX_SYMBOL[a] ?? all)
        : part.replace(/\\(rightarrow|leftarrow|Rightarrow|leftrightarrow)\b/g, (all, b) => LATEX_SYMBOL[b] ?? all),
    )
    .join('');

/**
 * 모델이 JSON 안에 LaTeX 역슬래시를 한 번만 쓰면(\boldsymbol, \frac, \theta, \rightarrow, \neq) JSON 이
 * 그것을 제어 문자(\b 백스페이스, \f, \t, \r, \n)로 읽어 버린다. 제어 문자 + 명령 이름 꼴을 역슬래시로 되돌린다.
 */
const CTRL_CMD = {
  '\b': /^(?:egin|ar|eta|oldsymbol|ot|ox|ig|m|ullet|ecause|inom|mod)/,
  '\f': /^(?:rac|orall|lat)/,
  '\t': /^(?:heta|imes|ext|frac|riangle|ilde|herefore|anh|(?:o|au|an|op)(?![a-z]))/,
  '\r': /^(?:ightarrow|ight|ho|m|angle|ceil|floor|Rightarrow|ightleftharpoons)/,
  '\n': /^(?:eq|e|u|abla|ot|eg|i|leq|geq|parallel|mid|subseteq|subset|exists|ewline)(?![a-zA-Z])/,
};
export function fixLatexEscapes(v) {
  if (Array.isArray(v)) return v.map(fixLatexEscapes);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fixLatexEscapes(x)]));
  if (typeof v !== 'string' || !/[\b\f\t\r\n]/.test(v)) return v;
  let out = '';
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    const re = CTRL_CMD[c];
    if (re && re.test(v.slice(i + 1))) {
      // 줄바꿈은 진짜 문단 나눔일 수 있어 수식($…) 안일 때만 되돌린다
      if (c === '\n' && (out.slice(out.lastIndexOf('\n') + 1).split('$').length - 1) % 2 === 0) {
        out += c;
        continue;
      }
      out += '\\' + { '\b': 'b', '\f': 'f', '\t': 't', '\r': 'r', '\n': 'n' }[c];
    } else out += c === '\b' || c === '\f' ? '' : c;
  }
  return out;
}

/** AI 가 guessed 로 알려 준 낱말을 글 속에서 찾아 ⟪ ⟫ 로 감싼다 (이미 감싼 곳·못 찾은 낱말은 건너뜀) */
export function markGuesses(text, guessed) {
  let s = String(text ?? '');
  for (const g of Array.isArray(guessed) ? guessed : []) {
    const w = String(g ?? '').trim();
    if (!w || w.length > 80) continue;
    let from = 0;
    for (;;) {
      const i = s.indexOf(w, from);
      if (i < 0) break;
      const open = s.lastIndexOf('⟪', i);
      const close = s.lastIndexOf('⟫', i);
      if (open > close) { from = i + w.length; continue; } // 이미 감싼 구간 안
      s = `${s.slice(0, i)}⟪${w}⟫${s.slice(i + w.length)}`;
      break;
    }
  }
  return s;
}

const hasGuessMark = (s) => /⟪[^⟫]*⟫/.test(s);

export function assemble(raw) {
  const out = [];
  for (let r of raw) {
    let type = BLOCK_TYPES.includes(r.type) ? r.type : 'paragraph';
    r = fixLatexEscapes(r); // 이미 저장된 AI 결과에 섞인 제어 문자도 되돌린다
    const text = markGuesses(fixSymbols(r.text), r.guessed).trim();
    if (r.title) r.title = fixSymbols(r.title);
    const prev = out[out.length - 1];
    if (r.cont && prev && prev.type === type && ['paragraph', 'list', 'box'].includes(type)) {
      const joinNoSpace = /[-­]$/.test(prev.text);
      prev.text = (joinNoSpace ? prev.text.replace(/[-­]$/, '') : prev.text + ' ') + text;
      if (r.uncertain) prev.flag = 'check';
      continue;
    }
    if (type === 'figure' && !r.figure?.src) {
      // 잘라 낼 수 없는 그림은 설명 문단으로 남긴다
      if (!text) continue;
      type = 'paragraph';
    }
    if (type === 'table') {
      const cell = (c) => markGuesses(fixSymbols(c), r.guessed);
      const rows = (Array.isArray(r.rows) ? r.rows : []).map((row) => (Array.isArray(row) ? row.map(cell) : [cell(row)]));
      if (!rows.length) {
        if (text) out.push(newBlock('paragraph', { text, page: r.page, flag: r.uncertain ? 'check' : 'todo' }));
        continue;
      }
      const w = Math.max(...rows.map((x) => x.length));
      rows.forEach((x) => { while (x.length < w) x.push(''); });
      out.push(newBlock('table', { rows, text, page: r.page, flag: r.uncertain ? 'check' : 'todo' }));
      continue;
    }
    if (!text && type !== 'figure') continue;
    // 소제목 끝에 붙은 ※ 안내문("❶ 감상문 ※ 한글로 작성하세요.")은 다음 문단으로 — 쪽마다 같은 모양이 되게
    const note = type === 'heading' && /^(.+?)\s+(※\s*\S.*)$/.exec(text);
    if (note && !text.includes('\n')) {
      const flag = r.uncertain || hasGuessMark(text) ? 'check' : 'todo';
      out.push(newBlock('heading', { text: note[1], level: r.level, page: r.page, flag }));
      out.push(newBlock('paragraph', { text: note[2], page: r.page, flag }));
      continue;
    }
    out.push(
      newBlock(type, {
        text,
        level: r.level,
        title: r.title,
        figure: r.figure,
        page: r.page,
        flag: r.uncertain ? 'check' : 'todo',
      }),
    );
  }
  // 맥락으로 추정한 낱말(⟪ ⟫)이 들어 있으면 AI 가 표시를 잊었더라도 '확인 필요'
  for (const b of out) {
    const all = [b.text, b.title, ...(b.rows || []).flat()].join('\n');
    if (/⟪[^⟫]*⟫/.test(all)) b.flag = 'check';
  }
  return joinShortChoices(out.filter((b) => !isExamBoilerplate(b)));
}

/**
 * 시험지의 시험 정보 머리 표와 수험 안내문은 학습자료 내용이 아니므로 뺀다 (AI·kordoc·붙여넣기 모두).
 *   · 안내문: "오늘 자신이 치를 과목의 문제지인지 확인", "답안지의 해당란에 … 확인", "다음 면에 계속"
 *   · 정보 표: 과목코드·선택형·서술형·시험지 면수·고사명 같은 낱말이 둘 이상 든 표
 */
const NOTICE = /자신이\s*치를\s*과목|문제지인지\s*확인|답안지의?\s*해당\s*란|답안지에?\s*(?:정확히\s*)?(?:기입|표기)|다음\s*면에\s*계속|수험\s*번호를?\s*(?:정확히\s*)?(?:기입|표기)/;
const EXAM_INFO = /과목\s*코드|선택형|서술형|서\.?논술형|시험지\s*면\s*수|(?:중간|기말)\s*고사|학년도|교시|홀수형|짝수형/g;
export function isExamBoilerplate(b) {
  const plainText = String(b.text ?? '').replace(/[_*]/g, '');
  if (b.type !== 'table' && b.type !== 'figure' && NOTICE.test(plainText) && plainText.length <= 80) return true;
  if (b.type === 'box' && NOTICE.test(`${b.title ?? ''} ${plainText}`) && plainText.length <= 80) return true;
  if (b.type === 'table') {
    const cells = (b.rows || []).flat().join(' ');
    const hits = new Set((cells.match(EXAM_INFO) || []).map((m) => m.replace(/\s/g, '')));
    if (hits.size >= 2 && (b.rows || []).length <= 3) return true;
  }
  return false;
}

/** 문항의 시작 줄인가 (1. … / 12) … / [서술형 1] / [서.논술형 2]) — 문항 사이를 한 줄 띄우는 데 쓴다 */
export const isQuestionStart = (b) =>
  b?.type === 'list' && (b.level || 1) === 1 && /^\s*(?:\d{1,2}\s*[.)]|[[<【]\s*[^\]>】]*(?:서술|논술|서답|단답)[^\]>】]*[\]>】]|(?:서술|논술|서답|단답)형\s*\d)/.test(b.text || '');

/**
 * 짧은 선택지(① −3, ② −2 …)가 한 줄에 하나씩 이어지면 원래 시험지처럼 한 줄에 탭으로 늘어놓는다.
 * 선택지 하나라도 길면(수식 포함 글자 수 기준) 그대로 둔다.
 */
const CHOICE = /^\s*([①-⑤])/;
export function joinShortChoices(blocks, maxLen = 12) {
  const out = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type !== 'list' || CHOICE.exec(b.text)?.[1] !== '①') {
      out.push(b);
      continue;
    }
    const run = [b];
    while (run.length < 5) {
      const n = blocks[i + run.length];
      if (!n || n.type !== 'list' || n.level !== b.level || CHOICE.exec(n.text)?.[1] !== '①②③④⑤'[run.length]) break;
      run.push(n);
    }
    const len = (t) => t.replace(/\$([^$]*)\$/g, (_, m) => m.replace(/\\[a-zA-Z]+|[{}^_\s]/g, '').slice(0, 12)).length;
    if (run.length >= 3 && run.every((c) => !c.text.includes('\n') && len(c.text) <= maxLen)) {
      // 탭 앞에 빈칸 둘: 글이 탭 위치에 딱 닿으면 탭 간격이 0 이 되어 선택지가 붙어 버린다
      out.push({ ...b, text: run.map((c) => c.text.trim()).join('  \t'), flag: run.some((c) => c.flag === 'check') ? 'check' : b.flag });
      i += run.length - 1;
    } else out.push(b);
  }
  return out;
}

/** 예전 시험지형 문서(exam-doc/v1)를 학습자료 블록으로 바꾼다 — 글자는 그대로 */
export function migrateDoc(doc) {
  if (!doc || doc.schema === 'study-doc/v2' || !Array.isArray(doc.items)) return doc;
  const blocks = [];
  let n = 0;
  let s = 0;
  const flag = (it) => it.flag || 'todo';
  const lines = (t) => String(t || '').split('\n').filter((x) => x.trim());
  for (const it of doc.items) {
    if (it.kind === 'text') blocks.push(newBlock('heading', { level: 2, text: it.text, flag: flag(it), page: it.page }));
    else if (it.kind === 'group') {
      if (it.instruction) blocks.push(newBlock('paragraph', { text: it.instruction, flag: flag(it), page: it.page }));
      lines(it.passage).forEach((t) => blocks.push(newBlock('paragraph', { text: t, flag: flag(it), page: it.page })));
      if (it.figure) blocks.push(newBlock('figure', { figure: it.figure, flag: flag(it), page: it.page }));
    } else if (it.kind === 'question') {
      const label = it.answerType === 'choice' ? `${++n}.` : `[서답형 ${++s}]`;
      const pts = it.points ? ` [${String(it.points).replace(/점$/, '')}점]` : '';
      blocks.push(newBlock('list', { level: 1, text: `${label} ${it.stem || ''}${pts}`.trim(), flag: flag(it), page: it.page }));
      lines(it.passage).forEach((t) => blocks.push(newBlock('paragraph', { text: t, flag: flag(it), page: it.page })));
      if (it.figure) blocks.push(newBlock('figure', { figure: it.figure, flag: flag(it), page: it.page }));
      if (it.box && (it.box.text || it.box.title)) blocks.push(newBlock('box', { title: it.box.title || '', text: it.box.text || '', flag: flag(it), page: it.page }));
      const marks = '①②③④⑤⑥⑦';
      (it.choices || []).forEach((c, i) => {
        if (c && c.trim()) blocks.push(newBlock('list', { level: 2, text: `${marks[i] ?? ''} ${c}`, flag: flag(it), page: it.page }));
      });
    }
  }
  const { items, ...rest } = doc;
  return { ...rest, schema: 'study-doc/v2', blocks };
}

/** 다른 앱·이전 형식 JSON 을 최대한 받아 준다 */
export function importJson(obj) {
  if (obj?.schema === 'study-doc/v2' && Array.isArray(obj.blocks)) return obj;
  if (obj?.schema === 'exam-doc/v1') return migrateDoc(obj);
  const doc = newDoc(obj?.title || '가져온 학습자료');
  const list = Array.isArray(obj) ? obj : obj?.blocks || obj?.items || obj?.sections || [];
  doc.blocks = assemble(
    list.map((x) =>
      typeof x === 'string'
        ? { type: 'paragraph', text: x }
        : { ...x, type: x.type || (x.rows ? 'table' : x.level ? 'heading' : 'paragraph'), text: x.text ?? x.content ?? x.body ?? '' },
    ),
  );
  return doc;
}

/** 원본 대조·미리보기용 순수 텍스트 한 줄 */
export function blockSummary(b) {
  if (b.type === 'table') return (b.rows || []).map((r) => r.join(' | ')).join(' / ');
  if (b.type === 'figure') return b.text || '(그림)';
  if (b.type === 'box') return [b.title, b.text].filter(Boolean).join(' — ');
  return b.text;
}

/** 학습자료 문서를 마크다운(.md) 텍스트로 변환 */
export function docToMarkdown(doc) {
  if (!doc) return '';
  const parts = [];
  let hasTitle = false;
  for (const b of doc.blocks || []) {
    if (b.type === 'title') {
      parts.push(`# ${b.text || doc.title || ''}`);
      hasTitle = true;
    } else if (b.type === 'heading') {
      const hashes = '#'.repeat(Math.max(1, Math.min(6, (b.level || 1) + 1)));
      parts.push(`${hashes} ${b.text || ''}`);
    } else if (b.type === 'paragraph') {
      parts.push(b.text || '');
    } else if (b.type === 'list') {
      const t = b.text || '';
      if (/^(\d+[.．]|[①-⑳•\-*]|\([0-9가-힣a-zA-Z]+\))/.test(t)) {
        parts.push(t);
      } else {
        const indent = '  '.repeat(Math.max(0, (b.level || 1) - 1));
        parts.push(`${indent}- ${t}`);
      }
    } else if (b.type === 'box') {
      const titleLine = b.title ? `> **${b.title}**\n>\n` : '';
      const body = (b.text || '').split('\n').map((l) => `> ${l}`).join('\n');
      parts.push((titleLine + body).trim());
    } else if (b.type === 'table') {
      if (Array.isArray(b.rows) && b.rows.length) {
        const h = b.rows[0];
        const sep = h.map(() => '---');
        const rows = b.rows.slice(1);
        const tbl = [`| ${h.join(' | ')} |`, `| ${sep.join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
        parts.push(tbl);
      }
    } else if (b.type === 'figure') {
      parts.push(b.text ? `![${b.text}](그림)\n*${b.text}*` : '![그림](그림)');
    }
  }
  let md = parts.filter(Boolean).join('\n\n');
  if (!hasTitle && doc.title) {
    md = `# ${doc.title}\n\n${md}`;
  }
  return md;
}
