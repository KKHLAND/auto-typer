// 시험지: 시험 정보 머리 표·수험 안내문은 빼고, 문항과 문항 사이는 한 줄 띄운다
import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { assemble, isExamBoilerplate, isQuestionStart } from '../src/model.js';
import { loadHwpx, buildHwpx } from '../src/engine/hwpx.js';

let fail = 0;
const expect = (name, ok) => { if (!ok) { console.error('FAIL', name); fail++; } };

const raw = [
  { type: 'table', rows: [['2024학년도 2학기\n기말고사', '과목코드\n[05]', '기하\n제(2)학년', '선택형: 1번 ~ 20번\n시험지면수: 총 (6)면']] },
  { type: 'box', title: '', text: '※ 오늘 자신이 치를 과목의 문제지인지 확인하시오.' },
  { type: 'paragraph', text: '※ __오늘 자신이 치를 과목의 문제지인지 확인하시오.__' },
  { type: 'list', level: 1, text: '1. 두 벡터가 이루는 각의 크기는? [4.9점]' },
  { type: 'list', level: 2, text: '① 1' }, { type: 'list', level: 2, text: '② 2' }, { type: 'list', level: 2, text: '③ 3' },
  { type: 'list', level: 1, text: '2. 다음 중 옳은 것은? [4.9점]' },
  { type: 'list', level: 1, text: '[서.논술형 1] 굴절률을 구하시오. [10점]' },
  { type: 'table', rows: [['실험', 'A', 'B'], ['I', 'ON', 'OFF']] }, // 문항 속 표는 남는다
  { type: 'box', title: '', text: '※ 답안지의 해당란에 필요한 내용을 정확히 기입(표기)했는지 확인하시오.' },
  { type: 'paragraph', text: '다음 면에 계속됩니다.' },
];
const bs = assemble(raw);
const texts = bs.map((b) => b.text || (b.rows || []).flat().join(' '));
expect('시험 정보 표 제외', !texts.some((t) => /과목코드/.test(t)));
expect('수험 안내문 제외', !texts.some((t) => /자신이 치를|답안지의 해당란|다음 면에 계속/.test(t)));
expect('문항 속 표는 남김', texts.some((t) => /실험/.test(t)));
expect('문항 시작 인식', isQuestionStart(bs.find((b) => b.text?.startsWith('1.'))) && isQuestionStart(bs.find((b) => b.text?.startsWith('[서.논술형'))));
expect('[서·논술형 1] (가운뎃점)', isQuestionStart({ type: 'list', level: 1, text: '[서·논술형 1] 그림은' }) && isQuestionStart({ type: 'list', level: 1, text: '<서답형 2> 다음' }));
expect('선지는 문항 시작 아님', !isQuestionStart({ type: 'list', level: 2, text: '① 1' }));
expect('일반 표는 안내문 아님', !isExamBoilerplate({ type: 'table', rows: [['구분', '명반응'], ['장소', '틸라코이드']] }));

// hwpx: 문항(3개) 사이에 빈 문단이 2개 들어간다 (첫 문항 앞에는 없음)
const tpl = loadHwpx(readFileSync('public/templates/sample.hwpx'));
const analysis = JSON.parse(readFileSync('public/templates/sample.profile.json', 'utf8'));
const sec = new TextDecoder().decode(unzipSync(buildHwpx(tpl, { title: 't', blocks: bs }, { analysis }))['Contents/section0.xml']);
const paras = [...sec.matchAll(/<hp:p\b[\s\S]*?<\/hp:p>/g)].map((m) => m[0]).slice(1);
const textOf = (p) => [...p.matchAll(/<hp:t>([^<]*)<\/hp:t>/g)].map((m) => m[1]).join('');
const gaps = paras.filter((p, i) => /^(\d+\.|\[서)/.test(textOf(p)) && i > 0 && !textOf(paras[i - 1]).trim()).length;
expect(`문항 앞 빈 줄 2개 (실제 ${gaps})`, gaps === 2);
console.log('exam layout', fail ? 'FAIL' : 'ok');
process.exit(fail ? 1 : 0);
