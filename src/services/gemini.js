import { fixLatexEscapes } from '../model.js';
// Gemini 호출 (선생님 본인 키, 브라우저에서 Google 로 직접 — 우리 서버는 없다)
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export const DEFAULT_MODEL = 'gemini-2.5-flash';

/** 키로 쓸 수 있는 모델 목록 (이미지 입력 가능한 gemini 계열) */
export async function listModels(key) {
  const r = await fetch(`${BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
  if (!r.ok) throw new Error(await errText(r));
  const j = await r.json();
  return (j.models || [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && /gemini/.test(m.name) && !/embedding|tts|image-generation|live|audio/.test(m.name))
    .map((m) => ({ id: m.name.replace('models/', ''), label: m.displayName || m.name }))
    .sort((a, b) => rank(b.id) - rank(a.id));
}

// 최신·flash 우선 (무료 사용량이 넉넉한 쪽)
function rank(id) {
  const v = parseFloat(/gemini-(\d+(?:\.\d+)?)/.exec(id)?.[1] ?? '0');
  return v * 10 + (/flash/.test(id) ? 3 : 0) + (/pro/.test(id) ? 1 : 0) - (/preview|exp/.test(id) ? 2 : 0) - (/lite/.test(id) ? 1 : 0);
}

async function errText(r) {
  try {
    const j = await r.json();
    return `${r.status} ${j.error?.message || ''}`;
  } catch {
    return `${r.status}`;
  }
}

const BLOCK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    blocks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: ['title', 'heading', 'paragraph', 'list', 'box', 'table', 'figure'] },
          text: { type: 'STRING' },
          level: { type: 'INTEGER' },
          title: { type: 'STRING' },
          rows: { type: 'ARRAY', items: { type: 'ARRAY', items: { type: 'STRING' } } },
          cont: { type: 'BOOLEAN' },
          uncertain: { type: 'BOOLEAN' },
          guessed: {
            type: 'ARRAY',
            description: '이 블록에서 글씨가 흐려 맥락으로 추정해 채운 낱말·구절을 text 에 쓴 그대로 적는다. 없으면 빈 배열.',
            items: { type: 'STRING' },
          },
          box_2d: { type: 'ARRAY', items: { type: 'INTEGER' } },
        },
        required: ['type', 'text'],
      },
    },
  },
  required: ['blocks'],
};

const RULES = `너는 한국 학교 선생님의 학습자료(수업 자료·학습지·판서·필기 노트·시험지 등)를 한글(hwp) 문서로 옮겨 정리하는 타이핑 담당자다.
목표는 내용을 새로 만들거나 바꾸는 것이 아니라, 보이는 내용을 '그대로' 옮기면서 구조(제목·문단·목록·상자·표·그림)만 나눠 주는 것이다.
읽기 순서를 지켜라: 2단 편집이면 왼쪽 단 위→아래, 그다음 오른쪽 단 위→아래.

[블록 종류]
- title: 자료 전체의 제목(보통 맨 위 한 줄). 없으면 쓰지 않는다.
- heading: 소제목. level=1(가장 큰 갈래)~3. 글씨 크기·굵기·번호 체계(Ⅰ. → 1. → (1))로 단계를 판단한다.
- paragraph: 본문 한 문단(문단마다 블록 하나). 문단 안의 줄바꿈은 이어 붙이고(영어 하이픈 줄바꿈은 단어로 합침) 문단 나눔만 블록으로 구분.
- list: 번호·기호로 시작하는 항목 하나. 번호·기호(1. ① (1) 가. • - ※ ▶ 등)는 text 맨 앞에 보이는 그대로 둔다.
        level=들여쓰기 깊이(1~3). 시험 문항이면 문항 번호 줄이 list, 선택지 ①~⑤는 각각 level 2 의 list.
- box: 테두리 상자·<보기>·참고·핵심 정리 상자. title=상자 제목(없으면 빈 문자열), text=내용(여러 줄은 \n).
- table: 표. rows=행 배열(각 행은 칸 글자 배열, 첫 행은 머리 행), text=표 제목(없으면 빈 문자열). 합친 칸은 왼쪽/위 칸에 글자를 두고 나머지는 "".
- figure: 그림·그래프·좌표평면·도형·도표·회로도·실험 장치·분자 구조·지도·사진. box_2d=[ymin,xmin,ymax,xmax] (0~1000 정규화)는
        그림에 딸린 축 이름·눈금·점 이름(O, A, B)·기호(ㄱ, ㄴ, (가))·화살표·범례까지 모두 들어가도록 넉넉히 잡는다.
        그림 안의 글자는 그림에 함께 담기므로 따로 블록으로 옮기지 않는다.
        text=그림 바로 위·아래에 인쇄된 그림 제목(예: <그림 1>, [자료 1])이 있으면 그대로, 없으면 빈 문자열 — 설명을 지어 쓰지 않는다.
        분수·행렬처럼 수식으로 쓸 수 있는 것은 그림이 아니라 수식, 칸으로 된 것은 table.

[반드시 지킬 것]
1. 내용을 고치거나 보태거나 요약하거나 번호를 새로 매기지 말 것. 또렷하게 쓰인 오탈자도 원문 그대로.
   글자가 흐리거나 뭉개져 읽기 어려우면 비워 두지 말고, 앞뒤 문장·문단의 맥락과 주제, 같은 사람이 다른 곳에 쓴 표현을 근거로
   가장 그럴듯한 글자·낱말을 골라 써 넣는다. 이렇게 추정해 채운 낱말·구절은 그 블록의 guessed 목록에 text 에 쓴 그대로 빠짐없이 적고
   uncertain=true 를 붙인다(예: text 에 "동생에게 많은것들을 양보했던" → guessed ["많은것들을"]). 선생님이 그 부분만 골라 원본과 대조한다.
   손글씨는 사람마다 획이 달라 한 쪽에 몇 군데는 흐린 곳이 있기 마련이다 — 조금이라도 확신이 없었던 낱말은 guessed 에 넣는다.
   또렷하게 읽은 낱말은 넣지 않는다.
   맥락으로도 도저히 추정할 수 없을 때만 [?] 를 쓴다.
2. 서식 표기: 인쇄된 밑줄은 __밑줄__, 굵은 글씨는 **굵게**, 빈칸(괄호 빈칸·밑줄 빈칸·네모 빈칸)은 [빈칸].
   ㉠㉡ ⓐⓑ ①② (A)(B) [A] 같은 기호와 원문자는 보이는 그대로 옮긴다.
3. 수식·화학식은 LaTeX 로 $ $ 사이에 쓴다 ($$ 는 쓰지 않는다). 앱이 한글 수식으로 바꾼다.
   예) $x^{2}+2x+1$, $\\frac{a}{b}$, $\\sqrt{x+1}$, $\\sqrt[3]{2}$, $f(x)=\\left(\\frac{1}{2}\\right)^{n}$, $\\lim_{x \\to 0}\\frac{\\sin x}{x}$,
   $\\sum_{k=1}^{n} a_{k}$, $\\int_{0}^{1} f(x)\\,dx$, $\\overline{AB}$, $\\angle ABC=90^{\\circ}$, $\\triangle ABC \\sim \\triangle DEF$, $\\vec{F}=m\\vec{a}$,
   $\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}$, $f(x)=\\begin{cases} x^{2} & (x \\ge 0) \\\\ -x & (x<0) \\end{cases}$, $\\{1, 2, 3\\}$, $P(A \\cap B)$.
   화학식·반응식은 원소 기호를 \\mathrm 로: $\\mathrm{H_2O}$, $2\\mathrm{H_2}+\\mathrm{O_2} \\rightarrow 2\\mathrm{H_2O}$, $\\mathrm{SO_4^{2-}}$, 가역 반응 \\rightleftharpoons.
   단위가 붙은 물리량은 $9.8\\,\\mathrm{m/s^2}$ 처럼. 손으로 쓴 수식·풀이도 같은 방법으로 옮긴다.
   문장 속 변수·식(x, 3a+2, f(x))도 수식이면 $ $ 로 감싸고, 숫자와 단위뿐인 글(3 cm, 25 %)은 그냥 글자로 둔다.
   수식이 아닌 글 속의 화살표·기호(→ ← ↔ ⇒ × · ○ △)는 $ $ 없이 그 문자 그대로 쓴다.
4. 쪽 번호, "다음 면에 계속됩니다", 반복되는 머리말·꼬리말, 저작권 표기는 옮기지 않는다.
   시험지의 시험 정보 머리 표(학년도·학기·고사명·날짜·과목코드·학년·과정·선택형/서술형 문항 수와 배점·시험지 면수)와
   수험 안내문(※ 오늘 자신이 치를 과목의 문제지인지 확인하시오, ※ 답안지의 해당란에 … 확인하시오 등)도 옮기지 않는다 — 문항부터 옮긴다.
5. 쪽의 첫 블록이 앞쪽에서 이어지는 문단·목록·상자의 계속이면 그 블록에 cont=true.
6. 활동지·학습지처럼 인쇄된 틀에 적어 넣은 자료라면: 맨 위 자료 제목은 title, 인쇄된 문항·칸 제목(예: "❶ 영화 감상문")은 heading level 1,
   그 아래 인쇄된 안내문(※ …)은 paragraph, 적어 넣은 답은 문단마다 paragraph 로 옮긴다. 답을 쓰는 줄·칸의 테두리는 상자가 아니다
   (box 는 제목이 붙은 <보기>·참고 상자에만). 학교·학번·이름 같은 머리 줄은 paragraph 한 줄. 같은 틀이 여러 쪽이면 모든 쪽을 같은 규칙으로 옮긴다.
   답 칸 안에 연하게 인쇄된 자리표시 문구(예: "이곳에 … 작성하세요...", "Write your … here...", "Dear Auggie, ...")는 옮기지 않는다.`;

const HANDWRITING = {
  ignore: `7. 손으로 쓴 필기(풀이 흔적, 계산, 체크 표시, 동그라미·가위표, 펜으로 그은 밑줄, 메모, 낙서)는 모두 무시하고 인쇄된 내용만 옮긴다.
   펜으로 그은 밑줄은 인쇄 밑줄이 아니므로 __ __ 로 표시하지 않는다.`,
  include: `7. 이 자료에는 손으로 쓴 판서·필기·메모·원고가 들어 있을 수 있다. 손글씨도 학습 내용으로 보고 쓰인 그대로 빠짐없이 옮긴다.
   글씨를 고치거나 문장을 다듬지 말고, 화살표·번호·들여쓰기로 표현된 순서와 위계는 문단과 번호로 살린다.
   지운 흔적·줄 그어 지운 글자·연습 계산은 옮기지 않는다. 흐린 글자는 1번 규칙대로 맥락으로 추정해 채우고 uncertain=true.`,
};

export function prompt({ handwriting = 'include', subject = '', pageNo, totalPages, isText }) {
  return [
    RULES,
    HANDWRITING[handwriting] ?? HANDWRITING.include,
    subject ? `과목 참고: ${subject}` : '',
    isText
      ? '아래는 학습자료에서 복사한 텍스트다. 줄바꿈이 깨져 있을 수 있으니 내용은 그대로 두고 구조만 판단해 블록으로 나눠라.'
      : `이 이미지는 전체 ${totalPages}쪽 중 ${pageNo}쪽이다.`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function call(key, model, parts, signal, onRetry) {
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: BLOCK_SCHEMA },
  };
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal,
    });
    if (r.ok) {
      const j = await r.json();
      const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      if (!text) throw new Error(`빈 응답 (${j.candidates?.[0]?.finishReason || j.promptFeedback?.blockReason || '이유 미상'})`);
      return fixLatexEscapes(JSON.parse(text).blocks || []);
    }
    // 무료 사용량 초과·일시 과부하는 기다렸다 다시
    if ((r.status === 429 || r.status >= 500) && attempt < 5) {
      const wait = Math.min(60, 4 * 2 ** attempt);
      onRetry?.(wait, r.status);
      await new Promise((res) => setTimeout(res, wait * 1000));
      continue;
    }
    const msg = await errText(r);
    if (r.status === 400 && /API key/i.test(msg)) throw new Error('API 키가 올바르지 않습니다. 설정에서 키를 확인해 주세요.');
    if (r.status === 403) throw new Error('이 키로는 Gemini 를 쓸 수 없습니다(권한 없음). Google AI Studio 에서 새 키를 받아 주세요.');
    throw new Error(`Gemini 오류: ${msg}`);
  }
}

/** 쪽 이미지 한 장 → 블록 */
export function recognizePage({ key, model, dataUrl, pageNo, totalPages, handwriting, subject, signal, onRetry }) {
  const [, mime, data] = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  return call(
    key,
    model || DEFAULT_MODEL,
    [{ text: prompt({ handwriting, subject, pageNo, totalPages }) }, { inline_data: { mime_type: mime, data } }],
    signal,
    onRetry,
  );
}

/** 텍스트 → 블록 (붙여넣은 글이 지저분할 때) */
export function structureText({ key, model, text, subject, signal, onRetry }) {
  return call(key, model || DEFAULT_MODEL, [{ text: prompt({ subject, isText: true }) + '\n\n---\n' + text }], signal, onRetry);
}

const BOX_SCHEMA = {
  type: 'OBJECT',
  properties: { box_2d: { type: 'ARRAY', items: { type: 'INTEGER' } } },
  required: ['box_2d'],
};

const BOX_RULES = `이 이미지는 시험지·학습지 한 쪽에서 그림 하나 둘레를 넉넉히 잘라 낸 것이다.
가운데 있는 그림(도형·그래프·실험 장치·사진·표 모양 그림)을 빠짐없이, 그러나 그 그림만 담는 가장 작은 상자를 구하라.
- 넣을 것: 그림의 선·면·사진, 그림 안팎에 붙은 기호와 이름표(A, P, O, x, y, α, ㄱ, 금속판, 광원 같은 낱말), 축 이름·눈금·단위,
  화살표, 범례, 그림 바로 아래의 (가)·(나)·<그림 1> 같은 그림 이름. 이름표 글자가 상자 밖으로 잘리면 안 된다.
- 뺄 것: 그림 위·아래·옆의 문제 문장, 선택지(①~⑤), <보기> 상자, 배점, 다른 문항의 글자, 이미지 가장자리에서 잘린 글자 조각, 쪽 테두리 선.
box_2d=[ymin, xmin, ymax, xmax] 를 이 이미지 기준 0~1000 으로 답하라.`;

/** 그림 둘레를 넉넉히 자른 이미지 → 그림만 담는 상자 [ymin,xmin,ymax,xmax] (0~1000, 그 이미지 기준) */
export async function refineFigureBox({ key, model, dataUrl, signal }) {
  const [, mime, data] = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  const r = await fetch(`${BASE}/models/${model || DEFAULT_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: BOX_RULES }, { inline_data: { mime_type: mime, data } }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: BOX_SCHEMA },
    }),
    signal,
  });
  if (!r.ok) throw new Error(await errText(r));
  const j = await r.json();
  const box = JSON.parse((j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('') || '{}').box_2d;
  return Array.isArray(box) && box.length === 4 && box[2] > box[0] && box[3] > box[1] ? box : null;
}

/** 키 확인용 아주 작은 호출 */
export async function testKey(key) {
  const models = await listModels(key);
  if (!models.length) throw new Error('쓸 수 있는 Gemini 모델이 없습니다');
  return models;
}
