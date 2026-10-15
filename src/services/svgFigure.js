// AI 도해(SVG) → 고해상도 PNG 그림
// 이미지 생성 모델은 무료 등급이 없어, 무료로 쓸 수 있는 글 모델(Gemini Flash)이 SVG 코드를 쓰고
// 브라우저가 그것을 PNG 로 그려 hwpx 의 그림(hp:pic)으로 넣는다. 서버로 보내는 것은 없다.

const SVG_NS = 'http://www.w3.org/2000/svg';
// SVG 를 <img> 로 그릴 때는 웹 글꼴을 못 쓰므로 컴퓨터에 있는 한글 글꼴로
const FONT = "'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Nanum Gothic', sans-serif";

/** AI 가 낸 글에서 <svg>…</svg> 만 꺼내고 위험한 것(스크립트·외부 연결·이벤트)을 지운다 */
export function sanitizeSvg(raw) {
  const m = /<svg[\s\S]*<\/svg>/i.exec(String(raw ?? ''));
  if (!m) throw new Error('AI 가 그림(SVG)을 만들지 못했습니다. 설명을 조금 더 구체적으로 써 보세요.');
  const doc = new DOMParser().parseFromString(m[0], 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) {
    throw new Error('AI 가 만든 그림 코드가 올바르지 않습니다. 다시 그려 보세요.');
  }
  for (const el of [...svg.querySelectorAll('script, foreignObject, iframe, object, embed, audio, video, image')]) el.remove();
  for (const el of [svg, ...svg.querySelectorAll('*')]) {
    for (const a of [...el.attributes]) {
      const v = a.value.trim().toLowerCase();
      if (/^on/i.test(a.name)) el.removeAttribute(a.name);
      else if (/href$/i.test(a.name) && !v.startsWith('#')) el.removeAttribute(a.name);
      else if (/url\(\s*['"]?(?!#)/i.test(a.value)) el.removeAttribute(a.name);
    }
  }
  svg.setAttribute('xmlns', SVG_NS);
  // 크기: viewBox 가 없으면 width·height 로 만든다
  let vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some((n) => !Number.isFinite(n)) || vb[2] <= 0 || vb[3] <= 0) {
    const w = parseFloat(svg.getAttribute('width')) || 400;
    const h = parseFloat(svg.getAttribute('height')) || 300;
    vb = [0, 0, w, h];
    svg.setAttribute('viewBox', vb.join(' '));
  }
  svg.setAttribute('width', String(vb[2]));
  svg.setAttribute('height', String(vb[3]));
  if (!svg.getAttribute('font-family')) svg.setAttribute('font-family', FONT);
  return { svg: new XMLSerializer().serializeToString(svg), width: vb[2], height: vb[3] };
}

/**
 * SVG → PNG 그림 블록 값 {src, w, h, mmW, svg}
 * 긴 변이 약 2000px 이 되도록 크게 그려 인쇄해도 선명하게 한다(흰 바탕).
 */
export async function svgToFigure(rawSvg, { mmW = 80 } = {}) {
  const { svg, width, height } = sanitizeSvg(rawSvg);
  const scale = Math.min(8, Math.max(1, 2000 / Math.max(width, height)));
  const W = Math.round(width * scale);
  const H = Math.round(height * scale);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('그림(SVG)을 그리지 못했습니다. 다시 그려 보세요.'));
      im.src = url;
    });
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, W, H);
    g.drawImage(img, 0, 0, W, H);
    return { src: c.toDataURL('image/png'), w: W, h: H, mmW, svg };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 직접 첨부한 그림 파일 → 그림 블록 값. hwpx 는 PNG·JPEG 만 담으므로 그 밖의 형식(WEBP·GIF·BMP)은 PNG 로 바꾼다.
 */
export async function imageFileToFigure(file) {
  const dataUrl = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(new Error('그림 파일을 읽지 못했습니다.'));
    fr.readAsDataURL(file);
  });
  const img = await new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('이 그림 형식은 열 수 없습니다. PNG·JPG 로 저장해 올려 주세요.'));
    im.src = dataUrl;
  });
  let src = dataUrl.replace(/^data:image\/jpg;/, 'data:image/jpeg;');
  if (!/^data:image\/(png|jpeg);/.test(src)) {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0);
    src = c.toDataURL('image/png');
  }
  return { src, w: img.width, h: img.height };
}
