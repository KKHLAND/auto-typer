import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { unzipSync } from 'fflate';
import { loadHwpx, buildHwpx, analyzeTemplate, collectHeaderTexts } from '../src/engine/hwpx.js';
import { sampleDoc } from '../src/sampleDoc.js';

mkdirSync('tests/out', { recursive: true });
let fail = 0;
for (const id of ['sample']) {
  const tpl = loadHwpx(readFileSync(`public/templates/${id}.hwpx`));
  const analysis = JSON.parse(readFileSync(`public/templates/${id}.profile.json`, 'utf8'));
  const ht = collectHeaderTexts(tpl);
  const edits = { [ht[2].key]: '원묵고등학교', [ht[3].key]: '관계대명사 한눈에 정리' };
  const bytes = buildHwpx(tpl, sampleDoc(), { analysis, headerEdits: edits });
  writeFileSync(`tests/out/${id}-sample.hwpx`, bytes);
  const files = unzipSync(bytes);
  const names = Object.keys(files);
  if (names[0] !== 'mimetype') { console.error('mimetype not first'); fail++; }
  for (const n of names.filter((n) => /\.(xml|hpf)$/.test(n))) {
    const errs = [];
    new DOMParser({ onError: (lvl, msg) => { if (lvl !== 'warning') errs.push(msg); } }).parseFromString(new TextDecoder().decode(files[n]), 'text/xml');
    if (errs.length) { console.error(id, n, errs.slice(0, 3)); fail++; }
  }
  const sec = new TextDecoder().decode(files['Contents/section0.xml']);
  console.log(id, bytes.length, 'bytes, paras', (sec.match(/<hp:p /g) || []).length, 'edited header ok:', sec.includes('관계대명사 한눈에 정리') && sec.includes('원묵고등학교'));
  // 생성물을 다시 분석해도 같은 역할로 읽히는지
  const re = analyzeTemplate(loadHwpx(bytes));
  console.log('  re-analysis stats', re.stats);
}
process.exit(fail ? 1 : 0);
