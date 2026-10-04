// 수학·과학 수식과 그림 시험: LaTeX·한글 수식 문법이 섞인 학습자료 → 샘플 양식 hwpx
//   node tests/math.test.mjs        → tests/out/math-science.hwpx (한글에서 열어 눈으로 확인)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { loadHwpx, buildHwpx, collectHeaderTexts } from '../src/engine/hwpx.js';
import { toHwpEquation } from '../src/engine/equation.js';
import { parseText } from '../src/engine/textParser.js';
import { assemble } from '../src/model.js';

mkdirSync('tests/out', { recursive: true });
let fail = 0;
const expect = (name, ok) => {
  if (!ok) { console.error('FAIL', name); fail++; }
};

// 1) 변환 규칙
const cases = [
  [String.raw`\frac{-b \pm \sqrt{b^2-4ac}}{2a}`, '{-b +- sqrt{b ^{2}-4ac}} over {2a}'],
  [String.raw`\sqrt[3]{x+1}`, 'root {3} of {x+1}'],
  [String.raw`\mathrm{H_2O}`, 'rm {H _{2}O} it'],
  [String.raw`\ce{SO4^2-}`, 'rm {SO _{4} ^{2-}} it'],
  [String.raw`\{1, 2, 3\}`, 'LEFT { 1, 2, 3 RIGHT }'],
  [String.raw`AB \parallel CD`, 'AB ∥ CD'],
  [String.raw`\dfrac{1}{2}`, '{1} over {2}'],
  ['{a} over {b}', '{a} over {b}'], // 한글 수식 문법은 그대로
  ['ax^2+bx+c=0', 'ax^{2}+bx+c=0'], // 중괄호 없는 첨자는 한 덩이만 (한글은 띄어 쓰기 전까지 모두 첨자로 묶는다)
];
for (const [src, want] of cases) expect(`${src} → ${toHwpEquation(src)}`, toHwpEquation(src) === want);

// 2) kordoc 식 마크다운: 수식 속 LaTeX 는 이스케이프 풀기에서 지켜지고, 글 속 \$ 는 글자 $
const md = String.raw`행렬 $\begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}$ 와 집합 $\{x \mid x>0\}$, 가격 \$40

$$\int_{0}^{1} x\,dx = \frac{1}{2}$$

![그림](image_001.png)`;
const bs = parseText(md);
expect('행렬 수식 보존', bs[0].text.includes(String.raw`$\begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}$`));
expect('집합 수식 보존', bs[0].text.includes(String.raw`$\{x \mid x>0\}$`));
expect('글 속 $ 보존', bs[0].text.includes('가격 $40'));
expect('따로 선 수식 $$ → $', bs[1].text === String.raw`$\int_{0}^{1} x\,dx = \frac{1}{2}$`);
expect('그림 자리표', bs[2]?.type === 'figure' && bs[2].figureRef === 'image_001.png');

// 3) 양식에 넣어 hwpx
const doc = {
  title: '수학·과학 수식 시험',
  blocks: assemble([
    { type: 'title', text: '수학·과학 수식 시험' },
    { type: 'heading', level: 1, text: 'Ⅰ. 수학' },
    { type: 'list', level: 1, text: String.raw`1. 이차방정식 $ax^{2}+bx+c=0$ 의 근은 $x=\frac{-b \pm \sqrt{b^2-4ac}}{2a}$ 이다.` },
    { type: 'list', level: 1, text: String.raw`2. $\lim_{x \to 0} \frac{\sin x}{x} = 1$ 이고 $\sum_{k=1}^{n} k = \frac{n(n+1)}{2}$ 이다.` },
    { type: 'list', level: 1, text: String.raw`3. $\int_{0}^{1} (x^2+1)\,dx$ 의 값과 $\left(\frac{1}{2}\right)^{n}$ 을 구하시오.` },
    { type: 'list', level: 1, text: String.raw`4. 행렬 $A=\begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}$, 함수 $f(x)=\begin{cases} x^{2} & (x \ge 0) \\ -x & (x<0) \end{cases}$` },
    { type: 'list', level: 1, text: String.raw`5. $\overline{AB} \perp \overline{CD}$, $\angle ABC = 90^{\circ}$, $\triangle ABC \sim \triangle DEF$, $AB \parallel CD$` },
    { type: 'list', level: 1, text: String.raw`6. 집합 $\{1, 2, 3\}$ 에서 $P(A \cap B) = \frac{1}{3}$, $\sqrt[3]{8}=2$, $\log_{2} 8 = 3$` },
    { type: 'list', level: 1, text: '7. 한글 수식 문법도 그대로: ${a} over {b}$, $sqrt {x+1}$, $LEFT ( 1 over 2 RIGHT )^{n}$, $a le b$' },
    { type: 'heading', level: 1, text: 'Ⅱ. 과학' },
    { type: 'paragraph', text: String.raw`물의 화학식은 $\mathrm{H_2O}$ 이고, $2\mathrm{H_2} + \mathrm{O_2} \rightarrow 2\mathrm{H_2O}$ 로 생성된다.` },
    { type: 'paragraph', text: String.raw`암모니아 합성: $\mathrm{N_2} + 3\mathrm{H_2} \rightleftharpoons 2\mathrm{NH_3}$, 황산 이온 $\ce{SO4^2-}$, 철 이온 $\mathrm{Fe^{3+}}$` },
    { type: 'paragraph', text: String.raw`뉴턴 운동 법칙 $\vec{F} = m\vec{a}$, 속도 $v = \frac{\Delta x}{\Delta t}$, 중력 가속도 $g = 9.8\,\mathrm{m/s^2}$` },
    { type: 'table', text: '<표 1> 물질의 성질', rows: [['물질', '화학식', '밀도'], ['물', String.raw`$\mathrm{H_2O}$`, String.raw`$1.0\,\mathrm{g/cm^3}$`], ['에탄올', String.raw`$\mathrm{C_2H_5OH}$`, String.raw`$0.79\,\mathrm{g/cm^3}$`]] },
    { type: 'box', title: '<보기>', text: String.raw`ㄱ. $E = mc^{2}` + '$\n' + String.raw`ㄴ. $PV = nRT$` },
  ]),
};
const png = existsSync('tests/out/fig.png') ? readFileSync('tests/out/fig.png') : null;
if (png) {
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  doc.blocks.push({ id: 'f1', type: 'figure', text: '<그림 1>', figure: { src: 'data:image/png;base64,' + png.toString('base64'), w, h, mmW: 60 } });
}
const tpl = loadHwpx(readFileSync('public/templates/sample.hwpx'));
const analysis = JSON.parse(readFileSync('public/templates/sample.profile.json', 'utf8'));
const ht = collectHeaderTexts(tpl);
const bytes = buildHwpx(tpl, doc, { analysis, headerEdits: { [ht[3].key]: doc.title } });
writeFileSync('tests/out/math-science.hwpx', bytes);
const sec = new TextDecoder().decode(unzipSync(bytes)['Contents/section0.xml']);
const scripts = [...sec.matchAll(/<hp:script>([\s\S]*?)<\/hp:script>/g)].map((m) => m[1]);
expect('수식 개수', scripts.length >= 30);
expect('수식 스크립트에 역슬래시 없음', scripts.every((s) => !s.includes('\\')));
console.log('math-science.hwpx', bytes.length, 'bytes, 수식', scripts.length, '개');
process.exit(fail ? 1 : 0);
