// AI 없이 동작하는 규칙 기반 파서: 텍스트(복붙·txt·md·hwpx 본문·PDF 텍스트층) → 블록 스트림
// 시험지에서 거의 변하지 않는 표지(문항 번호, ①~⑤, [1~3], <보기>)만 믿는다.

const RE = {
  group: /^\s*\[\s*(\d{1,3})\s*[~∼～\-－]\s*(\d{1,3})\s*\]\s*(.*)$/,
  stem: /^\s*(\d{1,3})\s*[.．]\s*(\S.*)$/,
  essay: /^\s*\[?\s*(서답형|서술형|논술형|단답형)\s*(\d{1,2})\s*\]?\s*[.．)]?\s*(.*)$/,
  choice: /[①②③④⑤⑥⑦]/,
  boxHead: /^\s*[<〈＜《]\s*보\s*기\s*[>〉＞》]\s*$/,
  points: /\s*[\[［(]\s*(\d+(?:\.\d+)?)\s*점\s*[\]］)]\s*$/,
  answer: /^\s*(정답|답)\s*[:：]\s*(.+)$/,
  section: /^\s*(서답형|서술형|논술형|단답형)(\s*문항)?\s*$/,
};

const MARKS = '①②③④⑤⑥⑦';

/** 마크다운·HTML 흔적을 내부 표기로 */
export function normalizeMarkdown(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/<u>([\s\S]*?)<\/u>/gi, '__$1__')
    .replace(/<b>([\s\S]*?)<\/b>|<strong>([\s\S]*?)<\/strong>/gi, (_, a, b) => `**${a ?? b}**`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/^#{1,6}\s+/gm, '')
    // 굵게 감싼 번호·표지: **1.** / **[1~3]** / **①**
    .replace(/^(\s*)\*\*\s*(\d{1,3}\s*[.．]|\[[^\]]{1,12}\]|[①-⑦])\s*\*\*/gm, '$1$2 ')
    // 줄 전체가 굵게/밑줄인데 그 안이 표지로 시작하면 감싼 것을 벗긴다
    .replace(/^(\s*)(\*\*|__)([^*_\n]+)\2\s*$/gm, (all, sp, mk, inner) =>
      /^\s*(\d{1,3}[.．]|\[\d|[①-⑦]|<\s*보)/.test(inner) ? sp + inner : all)
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*]\s+(?=[①②③④⑤])/gm, '');
}

/** 한 줄에 여러 선지가 있으면 쪼갠다: "① a ② b ③ c" */
function splitChoices(line) {
  const parts = [];
  const idx = [];
  for (let i = 0; i < line.length; i++) if (MARKS.includes(line[i])) idx.push(i);
  // 줄이 선지 기호로 시작할 때만 선지 줄로 본다 (지문 속 ①은 밑줄 번호)
  if (!idx.length || line.slice(0, idx[0]).trim()) return null;
  idx.forEach((s, k) => {
    const e = k + 1 < idx.length ? idx[k + 1] : line.length;
    parts.push({ number: MARKS.indexOf(line[s]) + 1, text: line.slice(s + 1, e).trim() });
  });
  // 지문 속 밑줄 번호가 연달아 나오는 경우(① __a__ … ② __b__)는 선지가 아님
  if (parts.length > 1 && parts.some((p) => p.text.length > 60)) return null;
  return parts;
}

export function parseText(raw) {
  const text = normalizeMarkdown(raw);
  const lines = text.split('\n');
  const blocks = [];
  let mode = 'free'; // free | stem | box | choices
  let para = []; // 이어 붙일 지문 줄
  let boxTitle = null;

  const flush = () => {
    if (!para.length) return;
    const t = para.join(' ').replace(/\s+/g, ' ').trim();
    if (t) blocks.push({ type: mode === 'box' ? 'box' : 'passage', text: t, title: boxTitle ?? undefined });
    para = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, ' ').trimEnd();
    if (!line.trim()) {
      flush(); // 빈 줄 = 문단 구분
      continue;
    }
    let m;
    if ((m = RE.group.exec(line))) {
      flush();
      blocks.push({ type: 'group', text: `[${m[1]}~${m[2]}] ${m[3]}`.trim() });
      mode = 'free';
      continue;
    }
    if (RE.section.test(line)) {
      flush();
      blocks.push({ type: 'text', text: line.trim() });
      mode = 'free';
      continue;
    }
    if ((m = RE.essay.exec(line)) && m[3]) {
      flush();
      const pm = RE.points.exec(m[3]);
      blocks.push({
        type: 'stem',
        number: +m[2],
        text: pm ? m[3].slice(0, pm.index) : m[3],
        points: pm?.[1],
        answerType: /논술|서술/.test(m[1]) ? 'essay' : 'short',
      });
      mode = 'stem';
      continue;
    }
    if ((m = RE.stem.exec(line)) && !/^\d+\.\d/.test(line.trim())) {
      flush();
      const pm = RE.points.exec(m[2]);
      blocks.push({ type: 'stem', number: +m[1], text: pm ? m[2].slice(0, pm.index) : m[2], points: pm?.[1] });
      mode = 'stem';
      boxTitle = null;
      continue;
    }
    if (RE.boxHead.test(line)) {
      flush();
      mode = 'box';
      boxTitle = '<보기>';
      continue;
    }
    if ((m = RE.answer.exec(line))) {
      flush();
      blocks.push({ type: 'answer', text: m[2].trim() });
      continue;
    }
    const ch = splitChoices(line);
    if (ch) {
      flush();
      for (const c of ch) blocks.push({ type: 'choice', number: c.number, text: c.text });
      mode = 'choices';
      continue;
    }
    if (mode === 'choices') {
      // 선지가 다음 줄로 넘어간 경우
      const last = blocks[blocks.length - 1];
      if (last?.type === 'choice' && line.length < 80) {
        last.text += ' ' + line.trim();
        continue;
      }
      mode = 'free';
    }
    const lastB = blocks[blocks.length - 1];
    if (
      mode === 'stem' && lastB?.type === 'stem' && !para.length && line.trim().length < 60 &&
      // 발문이 아직 끝나지 않았거나(물음표·마침표 없음) 이 줄이 물음으로 끝나면 이어 붙인다
      (!/[?？.]\s*$|점\]\s*$/.test(lastB.text) || /[?？]\s*$|점\]\s*$/.test(line))
    ) {
      // 발문이 두 줄로 나뉜 경우
      const st = blocks[blocks.length - 1];
      const pm = RE.points.exec(line);
      st.text += ' ' + (pm ? line.slice(0, pm.index) : line).trim();
      if (pm) st.points = pm[1];
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return blocks;
}
