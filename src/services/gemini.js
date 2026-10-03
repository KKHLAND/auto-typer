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
          type: { type: 'STRING', enum: ['group', 'stem', 'passage', 'box', 'choice', 'figure', 'text', 'answer'] },
          text: { type: 'STRING' },
          number: { type: 'INTEGER' },
          points: { type: 'STRING' },
          answerType: { type: 'STRING', enum: ['choice', 'short', 'essay'] },
          title: { type: 'STRING' },
          cont: { type: 'BOOLEAN' },
          uncertain: { type: 'BOOLEAN' },
          box_2d: { type: 'ARRAY', items: { type: 'INTEGER' } },
        },
        required: ['type', 'text'],
      },
    },
  },
  required: ['blocks'],
};

const RULES = `너는 한국 중·고등학교 학습자료(시험지·학습지·워크시트 등)를 한글(hwp) 문서로 옮기는 전문 타이핑 담당자다.
주어진 내용을 '블록' 목록(JSON)으로 옮겨라. 읽기 순서를 지켜라: 2단 편집이면 왼쪽 단 위→아래, 그다음 오른쪽 단 위→아래.

[블록 종류]
- group: 묶음 지시문. 예) "[1~3] 다음 글을 읽고 물음에 답하시오." (text 에 대괄호 범위까지 그대로)
- stem: 문항 발문. number=문항 번호(숫자만), text 에는 번호와 배점을 빼고 발문만. 배점 "[3점]"/"[3.6점]"은 points="3"/"3.6".
        서답형·서술형·논술형 문항은 answerType 을 short(단답)/essay(서술·논술)로, 선택형은 choice.
- passage: 지문의 한 문단(문단마다 블록 하나). 문단 안의 줄바꿈은 이어 붙이고(영어 하이픈 줄바꿈은 단어로 합침) 문단 나눔만 블록으로 구분.
- box: <보기> 같은 상자 안 내용. title 에 상자 제목("<보기>")을, text 에 내용. 상자 안 문단이 여럿이면 text 안에서 \\n 으로 구분.
- choice: 선택지 하나. number=1~5, text 에는 ①②③④⑤ 기호를 뺀 내용만. 한 줄에 여러 선지가 있어도 각각 블록으로.
- figure: 그림·도표·그래프·사진. box_2d=[ymin,xmin,ymax,xmax] (0~1000 정규화), text=한 줄 설명.
- text: 위에 속하지 않는 본문 글(예: "서답형" 같은 구역 제목, 문항 사이 안내문).
- answer: 정답이 인쇄되어 있으면 그 문항의 정답.

[반드시 지킬 것]
1. 내용을 고치거나 보태거나 요약하지 말 것. 오탈자도 원문 그대로. 읽을 수 없는 글자는 [?] 로 쓰고 그 블록에 uncertain=true.
2. 서식 표기: 인쇄된 밑줄은 __밑줄__, 굵은 글씨는 **굵게**, 빈칸(괄호 빈칸·밑줄 빈칸·네모 빈칸)은 [빈칸].
   ㉠㉡ ⓐⓑ ①② (A)(B) [A] 같은 기호와 원문자는 보이는 그대로 옮긴다. 지문 속 밑줄 친 번호는 "① __단어__" 처럼.
3. 수식은 한글(hwp) 수식 문법으로 $ $ 사이에: 예) $x^{2}+2x+1$, \${a} over {b}$, $sqrt {x+1}$, $f(x)= LEFT ( 1 over 2 RIGHT )^{n}$,
   $lim _{x -> 0}$, $sum _{k=1} ^{n} a_{k}$, $int _{0} ^{1} f(x)dx$, $alpha$, $theta$, $pi$, $le$, $ge$, $neq$, $times$.
4. 자료 머리(학교명·과목·학년도·시험명 표), 쪽 번호, "다음 면에 계속됩니다", 머리말·꼬리말, 수험번호·이름 칸, 저작권 표기는 옮기지 않는다.
5. 쪽의 첫 블록이 앞쪽에서 이어지는 지문·선지의 계속이면 그 블록에 cont=true.`;

const HANDWRITING = {
  ignore: `6. 손으로 쓴 필기(풀이 흔적, 계산, 체크 표시, 동그라미·가위표, 펜으로 그은 밑줄, 메모, 낙서)는 모두 무시하고 인쇄된 내용만 옮긴다.
   펜으로 그은 밑줄은 인쇄 밑줄이 아니므로 __ __ 로 표시하지 않는다.`,
  include: `6. 이 자료는 손으로 쓴 시험 원안일 수 있다. 손글씨도 시험 내용으로 보고 정확히 옮긴다.
   단, 지운 흔적·줄 그어 지운 글자·연습 계산은 옮기지 않는다. 확신이 없는 글자는 [?] 와 uncertain=true.`,
};

function prompt({ handwriting = 'ignore', subject = '', pageNo, totalPages, isText }) {
  return [
    RULES,
    HANDWRITING[handwriting] ?? HANDWRITING.ignore,
    subject ? `과목 참고: ${subject}` : '',
    isText
      ? '아래는 학습자료에서 복사한 텍스트다. 줄바꿈이 깨져 있을 수 있으니 구조를 판단해 블록으로 나눠라.'
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
      return JSON.parse(text).blocks || [];
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

/** 키 확인용 아주 작은 호출 */
export async function testKey(key) {
  const models = await listModels(key);
  if (!models.length) throw new Error('쓸 수 있는 Gemini 모델이 없습니다');
  return models;
}
