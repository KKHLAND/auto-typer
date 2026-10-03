// 입력 → 블록 왕복 확인 (원본 샘플 hwpx 는 상위 폴더에 있다)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { hwpxToText } from '../src/engine/hwpxReader.js';
import { parseText } from '../src/engine/textParser.js';
import { assemble } from '../src/model.js';

mkdirSync('tests/out', { recursive: true });
const count = (bs) => bs.reduce((m, b) => ((m[b.type] = (m[b.type] ?? 0) + 1), m), {});

const md = `# 광합성 정리

## 1. 광합성이란
식물이 빛에너지를 이용해
포도당을 만드는 과정이다.

- 장소: 엽록체
- 재료: 이산화 탄소, 물
  - 물은 뿌리에서 흡수

<보기>
6CO₂ + 12H₂O → C₆H₁₂O₆ + 6O₂ + 6H₂O

| 구분 | 명반응 | 암반응 |
|---|---|---|
| 장소 | 틸라코이드 | 스트로마 |

① 빛이 필요하다.
② 산소가 나온다.`;
const mdBlocks = assemble(parseText(md));
console.log('markdown', count(mdBlocks));
console.log('  ', mdBlocks.map((b) => `${b.type}${b.level ? b.level : ''}:${(b.text || (b.rows || []).flat().join('/')).slice(0, 18)}`).join(' | '));

for (const f of ['../2026년_1학기_기말고사_영어독해와작문.hwpx', '../2024학년도 수능국어 문제지.hwpx']) {
  if (!existsSync(f)) continue;
  const t = hwpxToText(readFileSync(f));
  const bs = assemble(parseText(t));
  writeFileSync('tests/out/' + (f.includes('수능') ? 'sn' : 'wm') + '.txt', t);
  console.log(f.slice(3, 20), 'chars', t.length, count(bs));
}
