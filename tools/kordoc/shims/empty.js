// 브라우저에는 파일 시스템·프로세스가 없다 — 경로 입력·CLI·COM 경로는 쓰지 않음
const no = () => { throw new Error('브라우저에서는 지원하지 않는 기능입니다'); };
export const readFile = no, writeFile = no, mkdir = no, stat = no, realpath = no, readFileSync = no, writeFileSync = no;
export const existsSync = () => false, statSync = no, mkdirSync = no, realpathSync = no, openSync = no, readSync = no, closeSync = no, lstatSync = no;
export const execFileSync = no, execFile = no, spawn = no;
export default {};
// 암호 걸린 문서 해제·모델 내려받기용 — 브라우저 판에서는 쓰지 않음
export const createHash = no, createDecipheriv = no, createCipheriv = no, pbkdf2Sync = no, randomBytes = no, webcrypto = undefined, createHmac = no;
export class Readable { static from() { no(); } }
export class Writable {}
export const pipeline = no, finished = no;
export const timingSafeEqual = no, createReadStream = no, createWriteStream = no, unlink = no, rename = no, rm = no, readdir = no, copyFile = no, access = no, open = no, unlinkSync = no, renameSync = no, readdirSync = no, rmSync = no, copyFileSync = no;
export const relative = no;
