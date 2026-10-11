// 채움 양식: 빈 칸 찾기 → 학생마다 한 부씩 채운 hwpx
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { unzipSync } from 'fflate';
import { loadHwpx } from '../src/engine/hwpx.js';
import { detectSlots, formOutline, buildFilledHwpx } from '../src/engine/form.js';

mkdirSync('tests/out', { recursive: true });
let fail = 0;
const check = (ok, msg) => {
  if (!ok) {
    console.error('FAIL', msg);
    fail++;
  }
};

const form = loadHwpx(readFileSync('tests/forms/수행평가_답안지.hwpx'));
const slots = detectSlots(form);
console.log(slots.map((s) => `${s.id} ${s.kind} ${s.label}`).join('\n'));
const by = (label) => slots.find((s) => s.label.startsWith(label));
check(by('학번')?.kind === 'cell', '학번 칸');
check(by('이름')?.kind === 'cell', '이름 칸');
check(slots.some((s) => s.kind === 'lines' && /^1\. 다음 글을/.test(s.label) && /Reading every day/.test(s.context)), '1번 답 줄 (지문 아래 빈 줄, 이름은 문항 줄)');
check(slots.filter((s) => s.off).every((s) => /점수/.test(s.label)) && slots.filter((s) => s.off).length === 2, '점수 칸은 처음엔 끔');
check(slots.some((s) => s.kind === 'cell' && /^2\. 자신이/.test(s.label)), '2번 답 상자 (1칸 표)');
check(slots.some((s) => /curious · 뜻/.test(s.label)), '3번 표 curious 뜻 칸');
check(slots.some((s) => s.kind === 'lines' && /^4\./.test(s.label)), '4번 밑줄 줄');
check(!slots.some((s) => /2026학년도/.test(s.label)), '제목 아래 한 줄 여백은 자리가 아님');

const outline = formOutline(form, slots);
check(outline.includes(`[[${by('학번').id}: 학번]]`), '양식 글에 자리 표시');
console.log('---\n' + outline + '\n---');

const id = (label) => by(label).id;
const recs = [
  {
    [id('학번')]: '10101',
    [id('이름')]: '김하늘',
    [slots.find((s) => /^1\. 다음 글을/.test(s.label)).id]: '매일 책을 읽으면 더 깊이 생각하고 다른 사람을 더 잘 이해하게 된다.',
    [slots.find((s) => /^2\. 자신이/.test(s.label)).id]: 'I like autumn the most.\nThe weather is cool and the leaves are beautiful.\nI can read books in the park.',
    [slots.find((s) => /curious · 뜻/.test(s.label)).id]: '호기심 많은',
    [slots.find((s) => /^4\./.test(s.label)).id]: '친구와 함께 글을 고쳐 쓰며 $x^{2}$ 처럼 정확하게 쓰는 법을 배웠다.',
  },
  { [id('학번')]: '10102', [id('이름')]: '이바다' },
];
const bytes = buildFilledHwpx(form, slots, recs, { title: '수행평가' });
writeFileSync('tests/out/form-filled.hwpx', bytes);
const files = unzipSync(bytes);
check(Object.keys(files)[0] === 'mimetype', 'mimetype 맨 앞');
for (const n of Object.keys(files).filter((n) => /\.(xml|hpf)$/.test(n))) {
  const errs = [];
  new DOMParser({ onError: (lvl, msg) => lvl !== 'warning' && errs.push(msg) }).parseFromString(new TextDecoder().decode(files[n]), 'text/xml');
  check(!errs.length, `${n} XML 오류 ${errs[0]}`);
}
const sec = new TextDecoder().decode(files['Contents/section0.xml']);
check((sec.match(/<hp:secPr\b/g) || []).length === 1, '구역 설정은 한 번만');
check((sec.match(/2026학년도 1학기/g) || []).length === 2, '양식이 두 부');
check(sec.includes('김하늘') && sec.includes('이바다') && sec.includes('호기심 많은'), '값이 채워짐');
check(sec.includes('<hp:equation'), '수식은 한글 수식으로');
check(/pageBreak="1"/.test(sec), '둘째 부는 새 쪽');
const ids = [...sec.matchAll(/<hp:tbl\b[^>]*?\sid="(\d+)"/g)].map((m) => m[1]);
check(new Set(ids).size === ids.length, '표 id 가 겹치지 않음');
// 1번 답 줄: 빈 줄 4개 중 답이 쓴 1~2줄만큼만 덜어 낸다
const q1 = sec.slice(sec.indexOf('Reading every day'), sec.indexOf('2. 자신이'));
check((q1.match(/<hp:p\b/g) || []).length >= 3, '남는 빈 줄은 그대로');

// 필드(누름틀·메일 머지)
{
  const dec = (k) => new TextDecoder().decode(form.files[k]);
  const f2 = { files: { ...form.files } };
  const fld = (fid, name, shown) =>
    `<hp:run charPrIDRef="15"><hp:ctrl><hp:fieldBegin id="${fid}" type="CLICK_HERE" name="${name}" editable="1" dirty="0" zorder="-1" fieldid="${fid}"><hp:parameters cnt="1" name=""><hp:stringParam name="Direction">${name}을(를) 쓰세요</hp:stringParam></hp:parameters></hp:fieldBegin></hp:ctrl>${shown}<hp:ctrl><hp:fieldEnd beginIDRef="${fid}" fieldid="${fid}"/></hp:ctrl></hp:run>`;
  const extra = `<hp:p id="0" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="15"><hp:t>모둠 이름: </hp:t></hp:run>${fld('900', '모둠', '')}<hp:run charPrIDRef="15"><hp:t> 역할: </hp:t></hp:run>${fld('901', '역할', '<hp:t>{{역할}}</hp:t>')}</hp:p>`;
  f2.files['Contents/section0.xml'] = new TextEncoder().encode(dec('Contents/section0.xml').replace('</hs:sec>', extra + '</hs:sec>'));
  const s2 = detectSlots(f2);
  const mo = s2.find((s) => s.kind === 'field' && s.label === '모둠');
  const ro = s2.find((s) => s.kind === 'field' && s.label === '역할');
  check(mo && ro, '필드 두 개');
  const out = new TextDecoder().decode(unzipSync(buildFilledHwpx(f2, s2, [{ [mo.id]: '푸른숲', [ro.id]: '기록' }, { [mo.id]: '바다' }]))['Contents/section0.xml']);
  check(out.includes('푸른숲') && out.includes('<hp:t>기록</hp:t>') && !out.includes('{{역할}}</hp:t><hp:t>'), '필드 값');
  const begins = [...out.matchAll(/<hp:fieldBegin\b[^>]*?\sid="(\d+)"/g)].map((m) => m[1]);
  const ends = [...out.matchAll(/beginIDRef="(\d+)"/g)].map((m) => m[1]);
  check(begins.length === 4 && new Set(begins).size === 4 && begins.every((b) => ends.includes(b)), '부마다 필드 id 새로 매김');
}

console.log(fail ? `${fail} failed` : 'form ok');
process.exit(fail ? 1 : 0);
