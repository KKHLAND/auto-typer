// 스캔본에서 잘라 낸 그림의 가장자리 정리
//
// 그림 둘레의 이름표(A, P, x, α)가 잘리지 않게 AI 가 준 상자보다 넉넉히 자르면, 옆 문항의 글자·
// 선택지·테두리 선 조각이 가장자리에 함께 걸린다. 생성형 이미지 모델로 지우면 그림 자체가 바뀔 수
// 있어(시험 그림은 한 획도 바뀌면 안 된다) 여기서는 규칙으로만 지운다.
//   · 잉크 덩어리(이어진 어두운 점들) 가운데 '잘린 가장자리에 닿고 대부분 AI 상자 밖에 있는' 것은 지운다.
//   · 통째로 상자 밖인 덩어리는 가까운 것끼리 묶어, 이름표 크기의 외톨이(축 이름 y, 꼭짓점 B)는 남기고
//     길게 늘어선 글줄(옆 문항 문장)·부스러기는 지운다. (labelMax = 이름표 하나의 최대 크기, px)
//   · 그다음 남은 잉크 둘레로 여백을 조금 남기고 다시 자른다.

/**
 * @param {Uint8ClampedArray} data RGBA (그대로 고쳐 쓴다)
 * @param {number} w
 * @param {number} h
 * @param {{l:number,t:number,r:number,b:number}} core AI 가 준 상자 (이 그림 안의 좌표)
 * @returns {{l:number,t:number,r:number,b:number}|null} 남길 영역 (잉크가 없으면 null)
 */
export function cleanFigure(data, w, h, core, { dark = 170, margin = 6, labelMax = 48 } = {}) {
  const N = w * h;
  const loose = [];
  const ink = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const k = i * 4;
    const lum = 0.299 * data[k] + 0.587 * data[k + 1] + 0.114 * data[k + 2];
    if (lum < dark) ink[i] = 1;
  }
  const label = new Int32Array(N);
  const stack = new Int32Array(N);
  let id = 0;
  const erase = [];
  for (let s = 0; s < N; s++) {
    if (!ink[s] || label[s]) continue;
    id++;
    let top = 0;
    stack[top++] = s;
    label[s] = id;
    const pix = [];
    let edge = false;
    let outside = 0;
    while (top) {
      const p = stack[--top];
      pix.push(p);
      const x = p % w;
      const y = (p - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      if (x < core.l || x > core.r || y < core.t || y > core.b) outside++;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (ink[q] && !label[q]) {
            label[q] = id;
            stack[top++] = q;
          }
        }
      }
    }
    // 대부분(또는 통째로) 상자 밖인 덩어리: 크면(선·글줄) 가장자리에 닿을 때 지우고,
    // 이름표만 한 작은 것은 아래에서 모양·위치를 보고 정한다 (가장자리에 걸린 꼭짓점 이름 B 를 살리려고)
    if ((edge && outside > pix.length * 0.5) || outside === pix.length) {
      let l = w, t = h, r = -1, b = -1;
      for (const p of pix) {
        const x = p % w, y = (p - x) / w;
        if (x < l) l = x;
        if (x > r) r = x;
        if (y < t) t = y;
        if (y > b) b = y;
      }
      const small = r - l + 1 <= labelMax && b - t + 1 <= labelMax;
      if (small) loose.push({ pix, l, t, r, b });
      else if (edge) erase.push(pix);
      else loose.push({ pix, l, t, r, b });
    }
  }
  // 통째로 상자 밖인 덩어리: 가까운 것끼리 묶어(한 낱말·한 줄) 이름표 크기의 외톨이(y, B, x(m))는 남기고,
  // 길게 늘어선 글줄(옆 문항 문장)이나 아주 작은 부스러기는 지운다
  // 같은 줄(세로로 겹침)은 낱말 사이 띄어쓰기(글자 하나 폭 남짓)까지 이어 묶어 글줄을 알아보고,
  // 위아래로는 바짝 붙은 것만 묶는다 (세로로 쓴 '변/위' 같은 축 이름)
  const hgap = Math.max(4, Math.round(labelMax * 0.6));
  const vgap = Math.max(2, Math.round(labelMax * 0.2));
  const touch = (G, c) =>
    (c.l <= G.r + hgap && c.r >= G.l - hgap && c.t <= G.b && c.b >= G.t) ||
    (c.t <= G.b + vgap && c.b >= G.t - vgap && c.l <= G.r && c.r >= G.l);
  const groups = [];
  for (const c of loose.sort((a, b) => a.l - b.l)) {
    let g = groups.find((G) => touch(G, c));
    if (!g) groups.push((g = { l: c.l, t: c.t, r: c.r, b: c.b, items: [] }));
    g.items.push(c);
    g.l = Math.min(g.l, c.l); g.t = Math.min(g.t, c.t); g.r = Math.max(g.r, c.r); g.b = Math.max(g.b, c.b);
  }
  // 묶음끼리 다시 닿으면 합친다 (왼쪽부터 붙여 가다 생긴 조각 묶음 정리)
  for (let merged = true; merged; ) {
    merged = false;
    for (let a = 0; a < groups.length && !merged; a++) {
      for (let b = a + 1; b < groups.length; b++) {
        const A = groups[a], B = groups[b];
        if (!touch(A, B)) continue;
        Object.assign(A, { l: Math.min(A.l, B.l), t: Math.min(A.t, B.t), r: Math.max(A.r, B.r), b: Math.max(A.b, B.b) });
        A.items.push(...B.items);
        groups.splice(b, 1);
        merged = true;
        break;
      }
    }
  }
  // 이름표는 그림 선 바로 곁(선 끝·화살표 끝)에 붙어 있다 — 상자 안 잉크와 reach px 안에 있어야 이름표로 본다
  const reach = Math.max(3, Math.round(labelMax * 0.3));
  const erased = new Uint8Array(N);
  for (const pix of erase) for (const p of pix) erased[p] = 1;
  const nearCore = (g) => {
    for (let y = Math.max(0, g.t - reach); y <= Math.min(h - 1, g.b + reach); y++) {
      if (y < core.t || y > core.b) continue;
      for (let x = Math.max(0, g.l - reach); x <= Math.min(w - 1, g.r + reach); x++) {
        if (x < core.l || x > core.r) continue;
        const i = y * w + x;
        if (ink[i] && !erased[i]) return true;
      }
    }
    return false;
  };
  for (const g of groups) {
    const gw = g.r - g.l + 1, gh = g.b - g.t + 1;
    const n = g.items.reduce((a, c) => a + c.pix.length, 0);
    // 상자 밖에서 살리는 이름표는 한 덩어리 글자(y, B, α, 4)뿐 — 한글 음절·낱말은 자모가 여러 덩어리로 나뉘므로
    // 여러 덩어리 묶음은 옆 문장 글자로 본다 (상자 안의 이름표는 이 규칙과 상관없이 남는다)
    const label = g.items.length === 1 && gw <= labelMax && gh <= labelMax && Math.max(gw, gh) >= labelMax * 0.15 && n >= 6 && nearCore(g);
    if (!label) g.items.forEach((c) => erase.push(c.pix));
  }
  for (const pix of erase) {
    for (const p of pix) {
      ink[p] = 0;
      const k = p * 4;
      data[k] = data[k + 1] = data[k + 2] = 255;
    }
  }
  // 상자 밖의 흐린 점(옅게 찍힌 옆 글자 조각)도 지운다 — 남은 잉크 바로 곁(2px)은 글자 가장자리라 둔다
  const near = (x, y) => {
    for (let dy = -2; dy <= 2; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx;
        if (xx >= 0 && xx < w && ink[yy * w + xx]) return true;
      }
    }
    return false;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= core.l && x <= core.r && y >= core.t && y <= core.b) continue;
      const i = y * w + x;
      if (ink[i] || near(x, y)) continue;
      const k = i * 4;
      data[k] = data[k + 1] = data[k + 2] = 255;
    }
  }
  // 남은 잉크 둘레 (AI 상자는 늘 포함)
  let l = core.l, t = core.t, r = core.r, b = core.b;
  let any = false;
  for (let i = 0; i < N; i++) {
    if (!ink[i]) continue;
    any = true;
    const x = i % w;
    const y = (i - x) / w;
    if (x < l) l = x;
    if (x > r) r = x;
    if (y < t) t = y;
    if (y > b) b = y;
  }
  if (!any) return null;
  return {
    l: Math.max(0, l - margin),
    t: Math.max(0, t - margin),
    r: Math.min(w - 1, r + margin),
    b: Math.min(h - 1, b + margin),
  };
}
