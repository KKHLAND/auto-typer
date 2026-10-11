# auto-typer

학습자료(PDF·스캔본·손글씨·hwp·hwpx·docx·xlsx·txt·md·json·사진·붙여넣기)를 원하는 학교 양식의 **hwpx** 와 **PDF** 로 바꿔 주는 선생님용 무료 웹앱.

## 읽는 방법

| 입력 | 엔진 |
|---|---|
| hwp·hwpx·docx·xlsx·글자 있는 PDF | **kordoc** 으로 마크다운 변환 → 규칙 파서가 블록으로 나눠 양식에 넣음 (AI 없이, 브라우저 안에서) |
| 스캔본·손글씨 PDF·사진 | Gemini(선생님 본인 키)가 쪽 이미지를 읽음 |
| txt·md·json·붙여넣기 | 규칙 파서 (키가 있으면 AI 구조화 선택 가능) |

**수식·화학식·그림(수학·과학 자료)**
- 수식은 `$…$` 안에 LaTeX(`\frac{a}{b}`, `\sqrt{x}`, 행렬·cases) 나 한글 수식 문법(`{a} over {b}`) 어느 쪽이든 쓸 수 있다. AI 는 LaTeX 로 읽고, hwpx 에는 kordoc 의 LaTeX→한글 수식 변환기로 **한글 수식 개체**가 들어간다.
- 화학식·단위는 `\mathrm{H_2O}`, `\ce{SO4^2-}`, `9.8\,\mathrm{m/s^2}` → 로만체 첨자. 가역 반응 `\rightleftharpoons` 는 위 → 아래 ← 로 쌓아 그린다.
- 한글은 열 때 수식 상자 크기를 다시 재지 않으므로, 분수·근호·첨자·극한·행렬 구조를 따라 크기를 어림해 넣는다 (`src/engine/equation.js`).
- 미리보기·PDF 는 앱에 포함된 KaTeX 로 그린다(인터넷 불필요).
- 그림: 스캔본은 AI 가 축 이름·기호까지 넉넉히 잘라 **원본 크기(mm)** 로, hwp·hwpx·docx 는 문서 속 그림을 그대로 꺼내 넣는다(BMP·GIF 는 PNG 로 바꿈).
  - 쪽 전체를 읽으며 잡은 그림 상자는 대략적이라, 그림 둘레를 다시 잘라 AI 에게 **그림만 담는 상자를 한 번 더** 묻는다.
  - 자른 뒤 가장자리에 걸린 옆 문장·선택지·테두리 조각은 규칙으로 지운다(`src/engine/figureClean.js`). 그림 선 곁의 외톨이 글자(축 이름 y, 꼭짓점 B)는 남긴다. 생성형 이미지 모델은 그림을 바꿀 수 있어 쓰지 않는다.
- 시험지 모양: 그림은 문항 발문 뒤로, 짧은 선택지(①~⑤)는 한 줄에 늘어놓는다. 머리 표 칸에 넘치는 긴 자료명은 글자를 줄여 한 줄에.
- AI 가 JSON 에 `\boldsymbol` 처럼 역슬래시를 한 번만 쓰면 제어 문자(`\b`)가 되어 한글이 '파일이 손상되었습니다'로 거부한다 → 되돌리고, hwpx 에는 XML 금지 제어 문자를 넣지 않는다.

**흐린 손글씨**는 비워 두지 않고 앞뒤 맥락으로 추정해 채운 뒤, 추정한 낱말을 편집 화면에서 <mark>노란색</mark>으로 표시하고 그 블록을 '확인 필요'로 둔다.
원본과 대조한 뒤 "확인했어요 — 표시 지우기"를 누르면 표시가 사라진다. hwpx·PDF 에는 표시 없이 글자만 들어간다.

## 학생 답안지를 양식에 채우기 (채움 양식)

수행평가 답안지·활동지 hwpx 를 [양식] 메뉴에 **빈 칸 그대로** 올리면 채울 자리를 찾아 둡니다.

- 표의 빈 칸(왼쪽·머리 행 글자가 칸 이름: `학번 | □`), 1칸짜리 답 상자
- 문항 아래 빈 줄 2줄 이상, 밑줄 친 빈 줄(`____` 포함)
- 누름틀·메일 머지 필드
- 점수·채점·확인·서명 칸은 선생님 칸으로 보고 처음엔 꺼 둠 ([칸 확인·이름 고치기]에서 켜고 끄기·이름 고치기)

[새 변환]에서 그 양식을 고르고 학생 답안지 스캔(PDF·사진)을 올리면, 학생(기본 1쪽 = 1명)마다 Gemini 가 칸별 답을
쓰인 그대로 읽고, 양식을 한 부씩 복사해 칸에 채운 hwpx 하나를 만듭니다(학생마다 새 쪽). 양식의 표·글꼴·쪽 설정은 그대로입니다.
엔진: `src/engine/form.js` (detectSlots · formOutline · buildFilledHwpx), 시험: `tests/form.test.mjs`, 시험용 양식: `tools/make-form-fixture.mjs`.

## 로컬 전용

- 서버는 **127.0.0.1** 에만 열린다 (같은 네트워크의 다른 기기도 접속 불가).
- 글꼴(Pretendard·Noto)과 PDF 문자표·해독기는 앱 안에 포함 → 인터넷 없이 동작.
- 빌드본의 CSP 가 앱 자신과 `generativelanguage.googleapis.com` 외의 모든 통신을 차단.
- 유일한 외부 통신은 스캔본·손글씨 **AI 인식**: 선생님이 본인 무료 Gemini 키를 넣고 쓸 때만.
- 자료는 브라우저(IndexedDB·localStorage)에만 저장.

## 실행

Windows: **`auto-typer 실행.bat`** 더블클릭 (처음 한 번 설치·빌드 후 브라우저가 열림, 창을 닫으면 종료).
코드를 고친 뒤에는 `dist` 폴더를 지우고 다시 실행하면 새로 빌드된다.

```bash
npm install
npm start          # 빌드 후 http://127.0.0.1:5180 (로컬 전용 + CSP 적용본)
npm run dev        # 개발용 (HMR)
npm test           # hwpx 엔진·수식 테스트 (tests/out/ 에 결과 hwpx — math-science.hwpx 는 한글에서 눈으로 확인)
```

## 구조

| 경로 | 역할 |
|---|---|
| `src/engine/hwpx.js` | hwpx 양식 엔진. 첫 문단(머리 표·단·머리말/꼬리말) 보존 → 본문 서식 학습(`analyzeTemplate`) → 문서를 그 서식으로 재작성(`buildHwpx`) |
| `src/engine/equation.js` | 수식: LaTeX ↔ 한글 수식 문법 변환(kordoc 변환기 + 화학식·기호 손질), 한글에 넣을 수식 크기 어림 |
| `src/engine/markup.js` | 인라인 표기 `__밑줄__` `**굵게**` `$수식$` `[빈칸]` `⟪추정⟫` — 모든 모듈 공용 |
| `src/engine/textParser.js` | AI 없는 규칙 파서 (제목 #·목록 기호·마크다운 표·<보기> 상자, 내용은 그대로) |
| `src/engine/hwpxReader.js` | 입력 hwpx → 표기 텍스트 (밑줄·굵게·자동 번호·큰 글씨 제목·표 복원) |
| `src/services/gemini.js` | 쪽 이미지 → 블록(JSON 스키마 강제) |
| `src/services/convert.js` | 입력 종류별 파이프라인 |
| `src/vendor/kordoc/` | [kordoc](https://github.com/KKHLAND/kordoc) (MIT) 브라우저 번들(문서 변환 `kordoc.browser.js`, 수식 변환 `equation.js`) + LICENSE·NOTICE·THIRD_PARTY — `tools/kordoc/build.mjs` 로 생성 |
| `src/preview/paper.js` | 미리보기·PDF 조판 (양식의 쪽 크기·여백·단을 그대로 사용) |
| `src/model.js` | 학습자료 모델 `study-doc/v2` (제목·소제목·문단·목록·상자·표·그림 블록, 번호는 원문 그대로) |
| `public/templates/` | 내장 샘플 양식(A4 2단 학습지: 학교명 · 학습 자료명 · 학번·이름 머리) — `npm run templates` 로 생성 |

## 내장 양식 다시 만들기

`tools/sample-source.hwpx`(선생님이 한글에서 직접 다듬은 A4 2단 학습지)의 머리 표·바닥글·쪽 설정은 그대로 두고(머리 표는 **머리말**로 옮겨 모든 쪽에 되풀이되게 함), 본문(지문)·목록 1단계(문항 줄)·목록 2단계(선지 줄) 서식을 역할로 정한 뒤 본문을 비워 저장한다. 양식을 바꾸고 싶으면 이 파일을 한글에서 고쳐 다시 실행하면 된다.

```bash
npm run templates
```

## kordoc 번들 다시 만들기

kordoc 은 Node 용 라이브러리라 Node 기능(파일 입력·CLI·로컬 OCR·인쇄)을 `tools/kordoc/shims/` 로 막고 `parse()` 만 브라우저용으로 묶는다. pdf.js 는 앱의 것을 같이 쓴다.

```bash
git clone https://github.com/KKHLAND/kordoc ../kordoc
cd ../kordoc && npm ci --omit=optional --ignore-scripts && cd -
node tools/kordoc/build.mjs ../kordoc
```
