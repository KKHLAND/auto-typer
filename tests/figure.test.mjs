import { readFileSync, writeFileSync } from 'node:fs';
import { loadHwpx, buildHwpx } from '../src/engine/hwpx.js';
import { sampleDoc } from '../src/sampleDoc.js';
const png = readFileSync(process.argv[2]);
// PNG 크기 읽기
const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
const doc = sampleDoc();
doc.blocks.splice(4, 0, { id: 'fig1', type: 'figure', text: '그림 1. 예시 그림', figure: { src: 'data:image/png;base64,' + png.toString('base64'), w, h } });
const tpl = loadHwpx(readFileSync('public/templates/sample.hwpx'));
const analysis = JSON.parse(readFileSync('public/templates/sample.profile.json', 'utf8'));
writeFileSync('tests/out/sample-figure.hwpx', buildHwpx(tpl, doc, { analysis }));
console.log('ok', w, h);
