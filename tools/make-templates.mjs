// 원본 샘플 hwpx → 본문을 걷어낸 가벼운 내장 양식 + 분석 결과(profile)
// 사용: npm run templates
import { readFileSync, writeFileSync } from 'node:fs';
import { loadHwpx, stripToTemplate } from '../src/engine/hwpx.js';

const SRC = '..';
const list = [
  { id: 'wonmook', file: '2026년_1학기_기말고사_영어독해와작문.hwpx' },
  { id: 'suneung', file: '2024학년도 수능국어 문제지.hwpx' },
];
for (const t of list) {
  const pkg = loadHwpx(readFileSync(`${SRC}/${t.file}`));
  const { bytes, analysis } = stripToTemplate(pkg);
  writeFileSync(`public/templates/${t.id}.hwpx`, bytes);
  writeFileSync(`public/templates/${t.id}.profile.json`, JSON.stringify(analysis, null, 2));
  console.log(t.id, bytes.length, 'bytes', JSON.stringify(analysis.profile), analysis.stats, analysis.geometry);
  console.log(' header texts:', analysis.headerTexts.map((h) => h.text).join(' | '));
}
