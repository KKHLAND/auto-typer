import { readFileSync, writeFileSync } from 'node:fs';
import { hwpxToText } from '../src/engine/hwpxReader.js';
import { parseText } from '../src/engine/textParser.js';
import { assemble } from '../src/model.js';
for (const f of ['../2026년_1학기_기말고사_영어독해와작문.hwpx', '../2024학년도 수능국어 문제지.hwpx']) {
  const t = hwpxToText(readFileSync(f));
  const items = assemble(parseText(t));
  const q = items.filter((i) => i.kind === 'question');
  console.log(f, 'chars', t.length, 'groups', items.filter((i) => i.kind === 'group').length, 'questions', q.length,
    'with5choices', q.filter((x) => x.choices.filter(Boolean).length === 5).length);
  writeFileSync('tests/out/' + (f.includes('수능') ? 'sn' : 'wm') + '.txt', t);
  console.log(q.slice(0, 3).map((x) => JSON.stringify({ stem: x.stem.slice(0, 50), p: x.points, pass: x.passage.slice(0, 60), ch: x.choices.map((c) => c.slice(0, 15)), box: x.box?.text?.slice(0, 30) })).join('\n'));
}
