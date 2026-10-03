// 처음 써 보는 선생님을 위한 예제 학습자료 (직접 쓴 수업 정리 노트)
import { newBlock, newDoc } from './model.js';

export function sampleDoc() {
  const d = newDoc('예제 학습자료');
  d.blocks = [
    newBlock('title', { text: '관계대명사 한눈에 정리' }),
    newBlock('heading', { level: 1, text: 'Ⅰ. 관계대명사란?' }),
    newBlock('paragraph', {
      text: '관계대명사는 두 문장을 이어 주면서, 앞에 나온 명사(**선행사**)를 꾸미는 절을 이끈다. 접속사와 대명사의 역할을 동시에 한다.',
    }),
    newBlock('box', {
      title: '핵심',
      text: 'I have a friend. + __She__ lives in Busan.\n→ I have a friend __who__ lives in Busan.',
    }),
    newBlock('heading', { level: 1, text: 'Ⅱ. 종류와 쓰임' }),
    newBlock('table', {
      rows: [
        ['선행사', '주격', '목적격', '소유격'],
        ['사람', 'who', 'who(m)', 'whose'],
        ['사물·동물', 'which', 'which', 'whose / of which'],
        ['사람·사물', 'that', 'that', '—'],
      ],
    }),
    newBlock('heading', { level: 2, text: '1. 주의할 점' }),
    newBlock('list', { level: 1, text: '① 전치사 뒤에는 that 을 쓸 수 없다.' }),
    newBlock('list', { level: 2, text: '예) the house in __which__ I live (○) / in that I live (×)' }),
    newBlock('list', { level: 1, text: '② 목적격 관계대명사는 생략할 수 있다.' }),
    newBlock('list', { level: 1, text: '③ 계속적 용법(, which)에는 that 을 쓰지 않는다.' }),
    newBlock('heading', { level: 2, text: '2. 확인 문제' }),
    newBlock('paragraph', { text: '다음 빈칸에 알맞은 말을 쓰시오.' }),
    newBlock('list', { level: 1, text: '(1) This is the book [빈칸] I bought yesterday.' }),
    newBlock('list', { level: 1, text: '(2) I met a boy [빈칸] father is a pilot.' }),
  ];
  return d;
}
