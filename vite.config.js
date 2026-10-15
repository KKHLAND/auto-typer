import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// 로컬 전용 원칙
//  - 서버는 이 컴퓨터(127.0.0.1)에서만 열린다. 같은 네트워크의 다른 기기에서도 접속 불가.
//  - 빌드본에는 CSP 를 걸어, 앱 자신과 Gemini(선생님이 AI 인식을 켰을 때만) 외의
//    모든 외부 통신을 브라우저가 차단한다. 글꼴·PDF 문자표는 앱 안에 포함되어 있다.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://generativelanguage.googleapis.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const cspPlugin = {
  name: 'local-only-csp',
  apply: 'build', // 개발 서버는 HMR 용 인라인 스크립트가 있어 빌드본에만 적용
  transformIndexHtml(html) {
    return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
  },
};

// 기본은 이 컴퓨터 전용(127.0.0.1:5180). 바깥에 열어야 하는 호스팅 환경(Google AI Studio 등)에서는
// HOST=0.0.0.0 PORT=3000 처럼 환경 변수로 바꾼다.
const serverConfig = {
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT) || 5180,
  strictPort: true,
};

// 구글 드라이브 폴더는 public/ 안에 숨김 시스템 파일 desktop.ini 를 만들어 두는데,
// vite 가 그것을 dist 로 복사하다 실패한다(ENOENT) → 빌드 전에 지운다 (폴더 아이콘 정보일 뿐)
function removeDesktopIni(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) removeDesktopIni(p);
    else if (e.name.toLowerCase() === 'desktop.ini') {
      try {
        fs.chmodSync(p, 0o666);
        fs.rmSync(p, { force: true });
      } catch {
        /* 지울 수 없으면 그대로 */
      }
    }
  }
}
removeDesktopIni(path.resolve('public'));

export default defineConfig({
  base: './',
  plugins: [react(), cspPlugin],
  server: serverConfig,
  preview: serverConfig,
  build: { chunkSizeWarningLimit: 1500 },
});
