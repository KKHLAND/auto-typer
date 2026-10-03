# auto-typer

학습자료(PDF·스캔본·손글씨·hwpx·txt·md·json·사진·붙여넣기)를 원하는 학교 양식의 **hwpx** 와 **PDF** 로 바꿔 주는 선생님용 무료 웹앱.

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
| `src/engine/markup.js` | 인라인 표기 `__밑줄__` `**굵게**` `$수식$` `[빈칸]` — 모든 모듈 공용 |
| `src/engine/textParser.js` | AI 없는 규칙 파서 (문항 번호·①~⑤·[1~3]·<보기>) |
| `src/engine/hwpxReader.js` | 입력 hwpx → 표기 텍스트 (밑줄·굵게·자동 번호 복원) |
| `src/services/gemini.js` | 쪽 이미지 → 블록(JSON 스키마 강제) |
| `src/services/convert.js` | 입력 종류별 파이프라인 |
| `src/preview/paper.js` | 미리보기·PDF 조판 (양식의 쪽 크기·여백·단을 그대로 사용) |
| `src/model.js` | 문서 모델 `exam-doc/v1`, 블록 → 문항 조립 |
| `public/templates/` | 내장 양식(원묵고·수능) — `npm run templates` 로 원본 샘플에서 생성 |

## 내장 양식 다시 만들기

상위 폴더(`cowork/`)의 원본 샘플 hwpx 에서 본문을 걷어내고 서식 분석 결과를 함께 저장한다.

```bash
npm run templates
```
