// 그림 가장자리 정리: 가장자리에 걸린 바깥 조각만 지우고, 그림에 딸린 이름표는 남긴다
import { cleanFigure } from '../src/engine/figureClean.js';

const w = 60, h = 40;
const img = new Uint8ClampedArray(w * h * 4).fill(255);
const dot = (x, y) => { const k = (y * w + x) * 4; img[k] = img[k + 1] = img[k + 2] = 0; };
for (let x = 15; x <= 45; x++) { dot(x, 10); dot(x, 30); }          // 그림: 사각형
for (let y = 10; y <= 30; y++) { dot(15, y); dot(45, y); }
dot(13, 8); dot(14, 9); dot(15, 9);                                 // 이름표 (일부가 상자 안에 걸침)
dot(5, 35); dot(6, 35);                                             // 여백 띠 안의 작은 부스러기 (통째로 상자 밖)
for (let y = 2; y <= 6; y++) { dot(55, y); dot(57, y); } dot(56, 4);  // 그림에서 먼 외톨이 글자 조각 → 지움
for (let y = 18; y <= 22; y++) { dot(48, y); dot(50, y); } dot(49, 20); // 상자 밖 외톨이 이름표 'H' 모양 → 남김
for (let x = 14; x <= 46; x += 3) { for (let y = 34; y <= 37; y++) dot(x, y); } // 상자 밖 글줄 (작은 글자 여러 개가 길게) → 지움
for (let y = 15; y <= 25; y++) { dot(0, y); dot(1, y); }            // 옆 글자 조각 (왼쪽 가장자리에 닿음)
for (let x = 0; x < w; x++) dot(x, 0);                              // 위 테두리 선
const core = { l: 14, t: 9, r: 46, b: 31 };
const keep = cleanFigure(img, w, h, core, { margin: 1, labelMax: 8 });
const ink = (x, y) => img[(y * w + x) * 4] < 128;
let fail = 0;
const expect = (name, ok) => { if (!ok) { console.error('FAIL', name); fail++; } };
expect('그림 선은 남는다', ink(15, 10) && ink(45, 30));
expect('이름표는 남는다', ink(13, 8));
expect('통째로 상자 밖 조각은 지운다', !ink(5, 35));
expect('가장자리 글자 조각은 지운다', !ink(0, 20) && !ink(1, 20));
expect('위 테두리 선은 지운다', !ink(30, 0));
expect('외톨이 이름표는 남긴다', ink(48, 20) && ink(49, 20));
expect('그림에서 먼 글자 조각은 지운다', !ink(55, 4));
expect('상자 밖 글줄은 지운다', !ink(20, 35) && !ink(44, 36));
expect('다시 자른 영역', keep.l === 12 && keep.t === 7 && keep.r === 51 && keep.b === 32);
console.log('figure clean', fail ? 'FAIL' : 'ok', keep);
process.exit(fail ? 1 : 0);
