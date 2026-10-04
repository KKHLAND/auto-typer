// kordoc(문서→마크다운, MIT, https://github.com/KKHLAND/kordoc) 의 브라우저용 번들 만들기
//
// kordoc 은 Node 용 라이브러리라 그대로는 브라우저에서 못 돈다. 파싱에 필요 없는 Node 기능
// (파일 경로 입력, CLI, MCP, 로컬 OCR·인쇄)은 shims/ 의 대체 모듈로 막고, zlib 은 fflate 로 바꿔
// parse() 하나만 묶는다. 결과물: src/vendor/kordoc/kordoc.browser.js
//
// 사용:  git clone https://github.com/KKHLAND/kordoc <폴더> && (cd <폴더> && npm ci --omit=optional --ignore-scripts)
//        node tools/kordoc/build.mjs <폴더>
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const src = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('kordoc 저장소 폴더를 인자로 주세요');
const S = (f) => resolve(here, 'shims', f);
const out = resolve(root, 'src/vendor/kordoc/kordoc.browser.js');
mkdirSync(dirname(out), { recursive: true });

// Node 내장 모듈 → 대체 모듈
const NODE = {
  zlib: 'zlib.js', util: 'util.js',
  os: 'node-misc.js', url: 'node-misc.js', module: 'node-misc.js', path: 'node-misc.js',
  fs: 'empty.js', 'fs/promises': 'empty.js', child_process: 'empty.js', crypto: 'empty.js', stream: 'empty.js', 'stream/promises': 'empty.js',
};
// 선택 기능(로컬 OCR·PDF 인쇄) — 앱은 스캔본·손글씨를 Gemini 로 읽으므로 쓰지 않는다
const OPTIONAL = /^(puppeteer-core|puppeteer|@puppeteer\/.*|onnxruntime-node|onnxruntime-web|@huggingface\/.*|sharp|@hyzyla\/pdfium|modern-tar(\/.*)?)$/;

writeFileSync(resolve(here, '.entry.ts'), `export { parse } from ${JSON.stringify(resolve(src, 'src/index.ts').replace(/\\/g, '/'))};\n`);
await build({
  entryPoints: [resolve(here, '.entry.ts')],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  minify: true,
  outfile: out,
  external: ['pdfjs-dist', 'pdfjs-dist/*'], // 앱이 이미 싣는 pdf.js 를 같이 쓴다
  inject: [S('buffer-global.js')],
  define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: [resolve(src, 'node_modules')],
  logLevel: 'warning',
  plugins: [{
    name: 'node-shims',
    setup(b) {
      b.onResolve({ filter: /^(node:)?(crypto|stream|stream\/promises|zlib|fs|fs\/promises|child_process|util|os|url|module|path)$/ }, (a) => ({ path: S(NODE[a.path.replace(/^node:/, '')]) }));
      b.onResolve({ filter: OPTIONAL }, () => ({ path: S('optional.js') }));
      // 대체 모듈이 쓰는 buffer·fflate·cfb 는 kordoc 쪽 node_modules 에서
      // ('buffer/' 처럼 끝에 / 를 붙여야 Node 내장 모듈이 아니라 같은 이름의 패키지를 찾는다)
      b.onResolve({ filter: /^(buffer|fflate|cfb)$/ }, (a) => {
        const id = a.path === 'buffer' ? 'buffer/' : a.path;
        return { path: execSync(`node -p "require.resolve('${id}')"`, { cwd: src }).toString().trim() };
      });
    },
  }],
});

// pdf.js 5 이후에는 PDFDocumentProxy.destroy() 가 없다 — 정리 단계에서 터지지 않게
let js = readFileSync(out, 'utf8');
const before = js.length;
js = js.replace(/(\w+)\.destroy\(\)\.catch\(/g, '$1.destroy?.()?.catch(');
let sha = '';
try { sha = execSync('git rev-parse --short HEAD', { cwd: src }).toString().trim(); } catch { /* 깃 아님 */ }
writeFileSync(out, `/* kordoc (MIT) browser build — https://github.com/KKHLAND/kordoc ${sha} — see LICENSE, NOTICE, THIRD_PARTY */\n${js}`);
console.log('kordoc browser bundle', out, `${(js.length / 1024).toFixed(0)} KB`, before === js.length ? '(destroy 패치 없음?)' : '(destroy 패치 적용)');
