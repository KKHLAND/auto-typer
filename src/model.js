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
  for (const r of raw) {
    let type = BLOCK_TYPES.includes(r.type) ? r.type : 'paragraph';
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
