// AI 가 JSON 에 LaTeX 역슬래시를 한 번만 써서 생긴 제어 문자(\b \f \t \r \n)를 되돌리는지,
// 그리고 hwpx 에 XML 금지 제어 문자가 들어가지 않는지 (하나라도 있으면 한글이 '파일이 손상되었습니다')
import { fixLatexEscapes } from '../src/model.js';
import { esc } from '../src/engine/hwpx.js';

const B = String.fromCharCode(8), F = String.fromCharCode(12), T = '\t', R = '\r', N = '\n', BS = '\\';
const cases = [
  ['$4' + B + 'oldsymbol{' + BS + 'pi}$', '$4' + BS + 'boldsymbol{' + BS + 'pi}$'],
  ['$' + F + 'rac{1}{2}$', '$' + BS + 'frac{1}{2}$'],
  ['$' + T + 'heta + ' + T + 'imes$', '$' + BS + 'theta + ' + BS + 'times$'],
  ['$a ' + R + 'ightarrow b$', '$a ' + BS + 'rightarrow b$'],
  ['$a ' + N + 'eq b$', '$a ' + BS + 'neq b$'],
  ['첫 문단' + N + 'eq 로 시작하는 둘째 문단', '첫 문단' + N + 'eq 로 시작하는 둘째 문단'], // 수식 밖 줄바꿈은 그대로
  ['표' + T + '칸', '표' + T + '칸'], // 명령이 아닌 탭은 그대로
];
let fail = 0;
for (const [a, want] of cases) {
  const got = fixLatexEscapes(a);
  if (got !== want) { fail++; console.error('FAIL', JSON.stringify(a), '→', JSON.stringify(got)); }
}
const e = esc('a' + B + 'b' + F + 'c' + String.fromCharCode(1) + 'd');
if (e !== 'abcd') { fail++; console.error('FAIL esc', JSON.stringify(e)); }
console.log('escapes', fail ? 'FAIL' : 'ok');
process.exit(fail ? 1 : 0);
