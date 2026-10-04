// 브라우저용 zlib 대체 (fflate)
import { inflateSync as rawIn, unzlibSync, deflateSync as rawDe, zlibSync } from 'fflate';
import { Buffer } from 'buffer';
const B = (u) => Buffer.from(u.buffer, u.byteOffset, u.byteLength);
const U = (b) => (b instanceof Uint8Array ? b : new Uint8Array(b));
export const inflateRawSync = (d) => B(rawIn(U(d)));
export const inflateSync = (d) => B(unzlibSync(U(d)));
export const deflateRawSync = (d) => B(rawDe(U(d)));
export const deflateSync = (d) => B(zlibSync(U(d)));
export const constants = { Z_SYNC_FLUSH: 2 };
export default { inflateRawSync, inflateSync, deflateRawSync, deflateSync, constants };
