// 로컬 OCR·PDF 인쇄용 선택 모듈 — 브라우저 판에서는 쓰지 않는다 (손글씨·스캔본은 앱의 Gemini 경로)
const no = () => { throw new Error('브라우저 판에서는 쓰지 않는 선택 기능입니다'); };
export default new Proxy({}, { get: () => no });
export const InferenceSession = { create: no }, Tensor = no, pipeline = no, env = {}, init = no;
