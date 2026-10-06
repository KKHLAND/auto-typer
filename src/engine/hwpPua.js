// 한컴오피스 / 평가원 PDF PUA(Private Use Area) 수식 폰트 디코더
//
// 한글(HWP)에서 내보낸 수능·모의고사·학교 시험지 PDF 는 수식 기호와 변수가
// 유니코드 사용자 정의 영역(U+E000~U+F8FF)으로 인코딩되어 있어 일반 텍스트 추출 시
// 글자가 깨집니다. 이 모듈은 한컴 수식 폰트 매핑을 복원합니다.

/** 한컴 PUA 문자인가 */
export const isPua = (code) => code >= 0xE000 && code <= 0xF8FF;

/**
 * 한컴 PUA 문자를 표준 유니코드 / LaTeX 기호로 치환
 * @param {string} text
 * @returns {string}
 */
export function decodeHancomPua(text) {
  if (!text) return '';
  return String(text).replace(/[\uE000-\uF8FF]/g, (ch) => {
    const code = ch.codePointAt(0);

    // 소문자 변수: 0xE0E5..0xE0FE -> a..z
    if (code >= 0xE0E5 && code <= 0xE0FE) {
      return String.fromCharCode(97 + (code - 0xE0E5));
    }
    // 대문자 변수: 0xE0C5..0xE0DE -> A..Z
    if (code >= 0xE0C5 && code <= 0xE0DE) {
      return String.fromCharCode(65 + (code - 0xE0C5));
    }
    // 숫자: 0xE034..0xE03C -> 1..9, 0xE03D -> 0
    if (code >= 0xE034 && code <= 0xE03C) {
      return String(code - 0xE033);
    }
    if (code === 0xE03D) return '0';
    // 보조 숫자 세트: 0xE030..0xE033 -> 0..3
    if (code >= 0xE030 && code <= 0xE033) {
      return String(code - 0xE030);
    }

    // 수학 연산자 및 기호
    switch (code) {
      case 0xE005: return 'F';
      case 0xE044: return '(';
      case 0xE045: return ')';
      case 0xE046: return '-';
      case 0xE047: return '=';
      case 0xE048: return '+';
      case 0xE049: return '±';
      case 0xE04A: return '∓';
      case 0xE04B: return '{';
      case 0xE04C: return '}';
      case 0xE04D: return '-';
      case 0xE052: return ',';
      case 0xE053: return '.';
      case 0xE054: return '/';
      case 0xE055: return '<';
      case 0xE056: return '>';
      case 0xE057: return '≤';
      case 0xE058: return '≥';
      case 0xE059: return '≠';
      case 0xE05A: return '≒';
      case 0xE05B: return '∫';
      case 0xE05C: return '√';
      case 0xE067: return '∑';
      case 0xE068: return '∏';
      case 0xE06D: return '―'; // 분수선 / 윗줄(overline)
      case 0xE078: return '{'; // cases 조건문 위쪽
      case 0xE079:
      case 0xE07A:
      case 0xE07B: return '';  // cases 조건문 중간/아래쪽 세로줄
      case 0xE0A4: return 'θ';
      case 0xE0A5: return 'α';
      case 0xE0A6: return 'β';
      case 0xE0A7: return 'γ';
      case 0xE0AC: return 'π';
      case 0xE0B2: return 'σ';
      case 0xE0B9: return 'ω';
      case 0xE0BB: return '∞';
      default: return '';
    }
  });
}

/**
 * PDF 텍스트에서 한컴 PUA 문자가 유의미하게 포함되어 있는지 확인
 */
export function hasHancomPua(text) {
  const count = (String(text).match(/[\uE000-\uF8FF]/g) || []).length;
  return count >= 10;
}

/**
 * 텍스트에서 분수선(―) 등으로 분리된 수식 줄들을 하나의 읽기 쉬운 수식으로 복원
 */
export function formatPuaMathLines(text) {
  let s = decodeHancomPua(text);

  // 분수 복원: "―4 1" 또는 "― 4 1" 또는 "―h f(1+h)-f(1)" 패턴
  // 분수선 뒤에 분모 분자가 연이어 오는 경우: {분자} over {분모}
  s = s.replace(/―\s*([0-9a-zA-Z\(\)]+)\s*([0-9a-zA-Z\(\)]+)/g, '($2/$1)');
  
  // 루트 복원: "√―3" -> "√3"
  s = s.replace(/√\s*―?\s*([0-9a-zA-Z]+)/g, '√$1');

  // 거듭제곱 복원: "x2", "x3", "t 2", "n 2" (문맥상 지수)
  s = s.replace(/([a-zA-Z\)])\s*([2345])(?=\s|[+\-=,;)<>]|$)/g, '$1^$2');

  // 미분 프라임 복원: f′(1)
  s = s.replace(/([a-zA-Z])\s*′\s*\(/g, "$1'(");

  // lim 기호 복원: "lim h→0" -> "lim_{h→0}"
  s = s.replace(/lim\s*([a-zA-Z]\s*→\s*[0-9a-zA-Z]+)/g, 'lim_{$1}');

  return s;
}
