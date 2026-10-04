# auto-typer

학습자료(PDF·스캔본·손글씨·hwp·hwpx·docx·xlsx·txt·md·json·사진·붙여넣기)를 원하는 학교 양식의 **hwpx** 와 **PDF** 로 바꿔 주는 선생님용 무료 웹앱.

## 읽는 방법

| 입력 | 엔진 |
|---|---|
| hwp·hwpx·docx·xlsx·글자 있는 PDF | **kordoc** 으로 마크다운 변환 → 규칙 파서가 블록으로 나눠 양식에 넣음 (AI 없이, 브라우저 안에서) |
| 스캔본·손글씨 PDF·사진 | Gemini(선생님 본인 키)가 쪽 이미지를 읽음 |
| txt·md·json·붙여넣기 | 규칙 파서 (키가 있으면 AI 구조화 선택 가능) |

**흐린 손글씨**는 비워 두지 않고 앞뒤 맥락으로 추정해 채운 뒤, 추정한 낱말을 편집 화면에서 <mark>노란색</mark>으로 표시하고 그 블록을 '확인 필요'로 둔다.
원본과 대조한 뒤 "확인했어요 — 표시 지우기"를 누르면 표시가 사라진다. hwpx·PDF 에는 표시 없이 글자만 들어간다.

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
npm test           # hwpx 엔진 테스트 (tests/out/ 에 결과 hwpx)
```

## 구조

| 경로 | 역할 |
|---|---|
| `src/engine/hwpx.js` | hwpx 양식 엔진. 첫 문단(머리 표·단·머리말/꼬리말) 보존 → 본문 서식 학습(`analyzeTemplate`) → 문서를 그 서식으로 재작성(`buildHwpx`) |
| `src/engine/markup.js` | 인라인 표기 `__밑줄__` `**굵게**` `$수식$` `[빈칸]` `⟪추정⟫` — 모든 모듈 공용 |
| `src/engine/textParser.js` | AI 없는 규칙 파서 (제목 #·목록 기호·마크다운 표·<보기> 상자, 내용은 그대로) |
| `src/engine/hwpxReader.js` | 입력 hwpx → 표기 텍스트 (밑줄·굵게·자동 번호·큰 글씨 제목·표 복원) |
| `src/services/gemini.js` | 쪽 이미지 → 블록(JSON 스키마 강제) |
| `src/services/convert.js` | 입력 종류별 파이프라인 |
| `src/vendor/kordoc/` | [kordoc](https://github.com/KKHLAND/kordoc) (MIT) 브라우저 번들 + LICENSE·NOTICE·THIRD_PARTY — `tools/kordoc/build.mjs` 로 생성 |
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
