// pdf.js 의 문자표(cMap)·표준 글꼴을 public/ 으로 복사 → 한글 PDF 도 외부 요청 없이 읽는다
import { cpSync, existsSync } from 'node:fs';
for (const d of ['cmaps', 'standard_fonts', 'wasm']) {
  const to = `public/pdfjs/${d}`;
  if (!existsSync(to)) cpSync(`node_modules/pdfjs-dist/${d}`, to, { recursive: true });
}
