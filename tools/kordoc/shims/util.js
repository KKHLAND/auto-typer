export const format = (f, ...a) => String(f).replace(/%[sdifjoO]/g, () => (a.length ? String(a.shift()) : '')) + (a.length ? ' ' + a.join(' ') : '');
export const promisify = (fn) => (...args) => new Promise((res, rej) => fn(...args, (e, v) => (e ? rej(e) : res(v))));
export default { format, promisify };
