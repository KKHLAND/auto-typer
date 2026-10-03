// 시험지 문서 모델 (exam-doc/v1)
//
// doc = { schema, title, templateId, headerEdits:{[templateId]:{[key]:text}}, items:[...] }
//
// item.kind
//   'group'    공통 지문 묶음:  { instruction:'[1~3] 다음 글을 읽고…', passage, figure }
//   'question' 문항:           { answerType:'choice'|'short'|'essay', stem, points, passage,
//                               box:{title,text}|null, figure:{src,w,h}|null, choices:[], answer, note }
//   'text'     자유 문단:       { text }   (예: '서답형' 같은 구역 제목)
//
// 텍스트 필드는 모두 markup.js 의 인라인 표기를 쓴다.

export const CHOICE_MARKS = ['①', '②', '③', '④', '⑤', '⑥', '⑦'];

let seq = 0;
export const uid = () => `i${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function newDoc(title = '새 학습자료') {
  return { schema: 'exam-doc/v1', title, templateId: 'wonmook', headerEdits: {}, items: [] };
}

export function newQuestion(p = {}) {
  return {
    id: uid(),
    kind: 'question',
    answerType: 'choice',
    stem: '',
    points: '',
    passage: '',
    box: null,
    figure: null,
    choices: ['', '', '', '', ''],
    answer: '',
    note: '',
    flag: 'todo', // todo 검토 전 · check 확인 필요 · done 검토 완료
    ...p,
  };
}

export function newGroup(p = {}) {
  return { id: uid(), kind: 'group', instruction: '', passage: '', figure: null, flag: 'todo', ...p };
}

export function newText(p = {}) {
  return { id: uid(), kind: 'text', text: '', flag: 'done', ...p };
}

/** 문항 번호 계산: 선택형은 1부터, 서답형은 별도로 1부터 */
export function numberItems(items) {
  let c = 0;
  let s = 0;
  const map = new Map();
  for (const it of items) {
    if (it.kind !== 'question') continue;
    if (it.answerType === 'choice') map.set(it.id, { n: ++c, label: `${c}.` });
    else map.set(it.id, { n: ++s, label: `[서답형 ${s}]` });
  }
  return map;
}

/**
 * 평평한 블록 스트림 → 문서 항목.
 * AI 추출과 규칙 파서가 모두 이 블록 형식을 낸다.
 *   {type:'group'|'stem'|'passage'|'box'|'choice'|'figure'|'text'|'answer',
 *    text, number?, points?, title?, answerType?, figure?, cont?}
 */
export function assemble(blocks) {
  const items = [];
  let cur = null; // 현재 문항
  let group = null; // 현재 묶음 (다음 문항 발문 전까지 지문을 받음)
  let lastText = null; // 페이지 넘어 이어지는 텍스트 붙일 대상 {obj, key}

  const appendTo = (obj, key, text, cont) => {
    if (!text) return;
    if (obj[key]) obj[key] += cont ? ' ' + text : '\n' + text;
    else obj[key] = text;
    lastText = { obj, key };
  };

  for (const b of blocks) {
    const text = (b.text ?? '').trim();
    const owner = () => cur || group;
    if (b.uncertain && owner()) owner().flag = 'check';
    if (b.cont && lastText && b.type !== 'stem' && b.type !== 'group' && b.type !== 'choice') {
      lastText.obj[lastText.key] += (/[-­]$/.test(lastText.obj[lastText.key]) ? '' : ' ') + text;
      continue;
    }
    switch (b.type) {
      case 'group':
        group = newGroup({ instruction: text, page: b.page, flag: b.uncertain ? 'check' : 'todo' });
        items.push(group);
        cur = null;
        lastText = { obj: group, key: 'instruction' };
        break;
      case 'stem':
        cur = newQuestion({
          stem: text,
          points: b.points ? String(b.points) : '',
          answerType: b.answerType || 'choice',
          page: b.page,
          flag: b.uncertain ? 'check' : 'todo',
          choices: b.answerType && b.answerType !== 'choice' ? [] : ['', '', '', '', ''],
        });
        items.push(cur);
        group = null;
        lastText = { obj: cur, key: 'stem' };
        break;
      case 'passage':
        if (cur && !cur.choices.some(Boolean)) appendTo(cur, 'passage', text, false);
        else if (group && !cur) appendTo(group, 'passage', text, false);
        else {
          // 소속 없는 지문 → 새 묶음 시작 (지시문 없음)
          group = newGroup({ passage: text, page: b.page });
          items.push(group);
          cur = null;
          lastText = { obj: group, key: 'passage' };
        }
        break;
      case 'box':
        if (cur) {
          cur.box = cur.box || { title: b.title || '<보기>', text: '' };
          appendTo(cur.box, 'text', text, false);
        } else if (group) appendTo(group, 'passage', text, false);
        break;
      case 'choice': {
        if (!cur) {
          cur = newQuestion({ stem: '' });
          items.push(cur);
        }
        const filled = cur.choices.filter(Boolean).length;
        const idx = b.number ? b.number - 1 : filled;
        while (cur.choices.length <= idx) cur.choices.push('');
        cur.choices[idx] = text;
        lastText = { obj: cur.choices, key: idx };
        break;
      }
      case 'figure': {
        const target = cur || group;
        if (target && b.figure) target.figure = b.figure;
        else if (b.figure) items.push(newGroup({ figure: b.figure }));
        break;
      }
      case 'answer':
        if (cur) cur.answer = text;
        break;
      default:
        if (text) {
          items.push(newText({ text }));
          cur = null;
          group = null;
        }
    }
  }
  // 빈 선지 꼬리 정리 (5개 미만 유지)
  for (const it of items) {
    if (it.kind === 'question' && it.answerType === 'choice') {
      while (it.choices.length > 5 && !it.choices[it.choices.length - 1]) it.choices.pop();
    }
  }
  return items;
}

/** 다른 앱·이전 형식 JSON 을 최대한 받아 준다 */
export function importJson(obj) {
  if (obj?.schema === 'exam-doc/v1' && Array.isArray(obj.items)) return obj;
  const doc = newDoc(obj?.title || '가져온 학습자료');
  const list = Array.isArray(obj) ? obj : obj?.items || obj?.questions || obj?.blocks || [];
  if (list.length && list[0]?.type && !list[0]?.kind) {
    doc.items = assemble(list);
    return doc;
  }
  doc.items = list.map((q) => {
    if (q.kind === 'group' || q.kind === 'text') return { ...q, id: uid() };
    return newQuestion({
      stem: q.stem ?? q.question ?? q.prompt ?? q.title ?? '',
      passage: q.passage ?? q.text ?? q.body ?? '',
      points: String(q.points ?? q.score ?? ''),
      choices: q.choices ?? q.options ?? q.answers ?? ['', '', '', '', ''],
      answer: String(q.answer ?? q.correct ?? ''),
      box: q.box ?? (q.example ? { title: '<보기>', text: q.example } : null),
      answerType: q.answerType ?? ((q.choices ?? q.options)?.length ? 'choice' : 'short'),
    });
  });
  return doc;
}
