import * as CFB_NS from 'cfb';
// path·url·os·module 의 아주 작은 대체 — 브라우저 파싱 경로에서는 실제로 쓰이지 않는다
export const relative = (a, b) => String(b);
export const join = (...p) => p.filter(Boolean).join('/').replace(/\/+/g, '/');
export const resolve = join, dirname = (p) => String(p).replace(/\/[^/]*$/, ''), basename = (p) => String(p).split('/').pop();
export const extname = (p) => (/(\.[^./]+)$/.exec(String(p)) || [, ''])[1], sep = '/', isAbsolute = (p) => String(p).startsWith('/');
export const fileURLToPath = (u) => String(u), pathToFileURL = (p) => ({ href: String(p) });
export const tmpdir = () => '/tmp', homedir = () => '/', platform = () => 'browser', cpus = () => [{}];
// require('cfb') 는 번들된 cfb 로, pdfjs 자산 경로는 앱이 함께 싣는 pdfjs/ 폴더로
const CFB = CFB_NS.default ?? CFB_NS;
export const createRequire = () => {
  const req = (id) => {
    if (id === 'cfb') return CFB;
    throw new Error('브라우저에서는 지원하지 않는 기능입니다: ' + id);
  };
  req.resolve = (id) => (id === 'pdfjs-dist/package.json' ? 'pdfjs/package.json' : (() => { throw new Error('resolve ' + id); })());
  return req;
};
export default { join, resolve, dirname, basename, extname, sep, isAbsolute, fileURLToPath, pathToFileURL, tmpdir, homedir, platform, cpus, createRequire };
