// PDF 읽기: 쪽 이미지 렌더링(AI 인식·원본 대조용) + 텍스트층 추출(규칙 인식용)
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function openPdf(bytes) {
  // 문자표·표준 글꼴은 앱에 포함된 사본을 쓴다 (외부 요청 없음)
  const base = new URL(`${import.meta.env.BASE_URL}pdfjs/`, location.href).href;
  return pdfjs.getDocument({
    data: bytes,
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`,
    wasmUrl: `${base}wasm/`, // 스캔본 JPEG2000·색 프로필 해독기
    isEvalSupported: false,
  }).promise;
}

/** 한 쪽을 JPEG dataURL 로 (긴 변 maxPx) */
export async function renderPage(pdf, n, maxPx = 2000) {
  const page = await pdf.getPage(n);
  const vp1 = page.getViewport({ scale: 1 });
  const scale = maxPx / Math.max(vp1.width, vp1.height);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
  // mmW: 쪽의 실제 너비(mm) — 잘라 낸 그림을 원본 크기 그대로 넣는 데 쓴다 (1pt = 25.4/72 mm)
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.88), width: canvas.width, height: canvas.height, mmW: (vp1.width * 25.4) / 72 };
}

/**
 * 텍스트층 → 읽기 순서 텍스트. 2단 시험지는 왼쪽 단 다음 오른쪽 단.
 * @returns {{text, chars}}
 */
export async function pageText(pdf, n) {
  const page = await pdf.getPage(n);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const items = tc.items
    .filter((it) => it.str !== undefined)
    .map((it) => ({ s: it.str, x: it.transform[4], y: vp.height - it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || 10, eol: it.hasEOL }));
  const chars = items.reduce((n, it) => n + it.s.trim().length, 0);
  if (!chars) return { text: '', chars: 0 };

  // 단 나누기: 가운데 근처에서 글자가 거의 지나가지 않는 세로 띠를 찾는다
  const mid = vp.width / 2;
  const crossing = items.filter((it) => it.x < mid - 5 && it.x + it.w > mid + 5).length;
  const twoCol = crossing < items.length * 0.05 && items.filter((it) => it.x > mid).length > items.length * 0.2;
  const cols = twoCol ? [items.filter((it) => it.x < mid), items.filter((it) => it.x >= mid)] : [items];

  const out = [];
  for (const col of cols) {
    col.sort((a, b) => a.y - b.y || a.x - b.x);
    let line = [];
    let lastY = null;
    let lastH = 10;
    const pushLine = () => {
      if (!line.length) return;
      line.sort((a, b) => a.x - b.x);
      let s = '';
      let prevEnd = null;
      for (const it of line) {
        if (prevEnd !== null && it.x - prevEnd > it.h * 0.25 && !s.endsWith(' ')) s += ' ';
        s += it.s;
        prevEnd = it.x + it.w;
      }
      out.push({ s: s.trimEnd(), y: line[0].y, h: lastH });
      line = [];
    };
    for (const it of col) {
      if (!it.s.trim()) continue;
      if (lastY !== null && Math.abs(it.y - lastY) > Math.max(2, it.h * 0.45)) pushLine();
      line.push(it);
      lastY = it.y;
      lastH = it.h;
    }
    pushLine();
    out.push({ s: '', y: 0, h: 0, colBreak: true });
  }
  // 줄 간격이 크게 벌어지면 문단 구분(빈 줄)
  const lines = [];
  for (let i = 0; i < out.length; i++) {
    const cur = out[i];
    const prev = out[i - 1];
    if (prev && !prev.colBreak && !cur.colBreak && cur.y - prev.y > prev.h * 2.1) lines.push('');
    lines.push(cur.s);
  }
  return { text: lines.join('\n'), chars };
}

/**
 * 이미지 dataURL 에서 상자 영역(0~1000 정규화 [ymin,xmin,ymax,xmax])만 잘라 PNG 로.
 * 그림 둘레의 축 이름·기호(ㄱ, A, x)가 잘리지 않게 조금 넉넉히 자른다. pageMmW 가 있으면 원본 크기(mm)도 함께.
 */
export async function cropFigure(dataUrl, box, pageMmW) {
  const img = await loadImage(dataUrl);
  const [y0, x0, y1, x1] = box.map((v) => Math.max(0, Math.min(1000, v)) / 1000);
  const pad = 0.012;
  const sx = Math.max(0, (x0 - pad) * img.width);
  const sy = Math.max(0, (y0 - pad) * img.height);
  const sw = Math.min(img.width - sx, (x1 - x0 + pad * 2) * img.width);
  const sh = Math.min(img.height - sy, (y1 - y0 + pad * 2) * img.height);
  if (sw < 8 || sh < 8) return null;
  const c = document.createElement('canvas');
  c.width = Math.round(sw);
  c.height = Math.round(sh);
  c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return { src: c.toDataURL('image/png'), w: c.width, h: c.height, ...(pageMmW ? { mmW: +((sw / img.width) * pageMmW).toFixed(1) } : {}) };
}

export function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

/** 사진·스캔 이미지 파일 → JPEG dataURL (긴 변 maxPx) */
export async function imageFileToPage(file, maxPx = 2000) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return { dataUrl: c.toDataURL('image/jpeg', 0.88), width: c.width, height: c.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
