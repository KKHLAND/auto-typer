// 두 번째 내장 양식 '1단 학습지(A4)' 만들기: 기본 양식1(public/templates/sample.hwpx)과 똑같이 하되 2단 → 1단.
// 머리 표 [학교명 | 학습 자료명]·쪽 번호·글꼴·본문 서식은 그대로, 단 사이 세로선은 없앤다.
// 사용: node tools/make-plain-template.mjs   (기본 양식1을 고친 뒤에도 다시 실행)
import { readFileSync, writeFileSync } from 'node:fs';
import { loadHwpx, readText, savePackage, geometry, collectHeaderTexts } from '../src/engine/hwpx.js';

const pkg = loadHwpx(readFileSync('public/templates/sample.hwpx'));
let sec = readText(pkg, 'Contents/section0.xml');
sec = sec.replace(/(<hp:colPr\b[^>]*\bcolCount=")\d+"/, '$11"').replace(/(<hp:colLine type=")[A-Z_]+"/, '$1NONE"');
pkg.files['Contents/section0.xml'] = new TextEncoder().encode(sec);

const analysis = JSON.parse(readFileSync('public/templates/sample.profile.json', 'utf8'));
analysis.geometry = geometry(sec);
analysis.headerTexts = collectHeaderTexts(pkg);
writeFileSync('public/templates/plain.hwpx', savePackage(pkg));
writeFileSync('public/templates/plain.profile.json', JSON.stringify(analysis, null, 2));
console.log('plain:', analysis.geometry.cols, '단, 단 너비', analysis.geometry.colWidth, ', 머리 문구', analysis.headerTexts.map((h) => h.text));
