// 처음 써 보는 선생님을 위한 예제 문서 (직접 지은 문항)
import { newDoc, newGroup, newQuestion, newText } from './model.js';

export function sampleDoc() {
  const d = newDoc('예제 시험지');
  d.items = [
    newQuestion({
      stem: '다음 글의 밑줄 친 부분 중, 어법상 **틀린** 것은?',
      points: '3.5',
      passage:
        'Reading is not a passive act. Good readers ① __constantly__ ask questions about what they read, and they ② __compare__ new ideas with what they already know.\nWhen a passage ③ __seem__ unclear, they slow down and reread it, ④ __which__ helps them notice details they missed. In this way, reading becomes a conversation ⑤ __that__ expands their thinking.',
      choices: ['', '', '', '', ''],
      answer: '③',
    }),
    newGroup({
      instruction: '[2~3] 다음 글을 읽고 물음에 답하시오.',
      passage:
        '기억은 과거를 그대로 담아 두는 저장고라기보다, ㉠__떠올릴 때마다 새로 구성되는 과정__에 가깝다. 오래된 기억일수록 그 사이에 겪은 일과 감정이 덧칠되어 처음과는 조금 다른 모습으로 남는다.\n결국 기억은 사실의 기록이라기보다 ⓐ해석의 결과라고 할 수 있다.',
    }),
    newQuestion({
      stem: '윗글의 내용과 일치하지 **않는** 것은?',
      choices: [
        '기억은 떠올릴 때마다 다시 구성된다.',
        '오래된 기억은 이후의 경험에 영향을 받는다.',
        '기억은 과거를 있는 그대로 보존한다.',
        '기억에는 감정이 덧붙여질 수 있다.',
        '기억은 해석의 결과로 볼 수 있다.',
      ],
      answer: '③',
    }),
    newQuestion({
      stem: '<보기>를 참고하여 ㉠을 이해한 내용으로 가장 적절한 것은?',
      points: '3',
      box: { title: '< 보 기 >', text: '십 년 만에 만난 두 친구가 함께 떠난 여행을 이야기하는데, 한 사람은 즐거웠던 일을, 다른 사람은 힘들었던 일을 먼저 떠올렸다.' },
      choices: ['두 사람의 기억은 모두 사실과 다르다.', '두 사람은 같은 경험을 다르게 재구성했다.', '즐거운 기억이 더 오래 남는다.', '힘든 기억은 쉽게 잊힌다.', '여행의 기억은 변하지 않는다.'],
    }),
    newText({ text: '서답형' }),
    newQuestion({ answerType: 'short', stem: '함수 $f(x)=x^{3}-6x^{2}+9x+a$ 의 극댓값이 7일 때, 상수 $a$ 의 값을 쓰시오.', points: '4' }),
    newQuestion({ answerType: 'essay', stem: '윗글의 주장에 대한 자신의 생각을 [빈칸] 자 이내로 서술하시오.', points: '6' }),
  ];
  return d;
}
