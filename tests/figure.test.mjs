import { readFileSync, writeFileSync } from 'node:fs';
import { loadHwpx, buildHwpx } from '../src/engine/hwpx.js';
import { sampleDoc } from '../src/sampleDoc.js';
const png = readFileSync(process.argv[2]);
// PNG 크기 읽기
const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
const doc = sampleDoc();
doc.items[2].figure = { src: 'data:image/png;base64,' + png.toString('base64'), w, h };
const tpl = loadHwpx(readFileSync('public/templates/wonmook.hwpx'));
const analysis = JSON.parse(readFileSync('public/templates/wonmook.profile.json', 'utf8'));
writeFileSync('tests/out/wonmook-figure.hwpx', buildHwpx(tpl, doc, { analysis }));
console.log('ok', w, h);
