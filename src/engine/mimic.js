// 원본 모양 따라 만들기 — 올린 PDF(또는 사진) 첫 쪽의 모양을 본떠 hwpx 양식을 새로 만든다.
//
//   1) 모양 읽기(spec): 쪽 크기·여백·단 수·머리 줄(칸 글자와 너비)·쪽 번호·본문 글자 크기
//        - 글자층이 있는 PDF 는 pdf.js 글자 위치로 직접 잰다 (specFromText)
//        - 스캔본·사진(또는 AI 키가 있을 때 머리 줄·테두리)은 Gemini 가 쪽 사진을 보고 알려 준다 (services/mimic.js)
//   2) 양식 짓기: 내장 샘플 양식(머리 표·쪽 번호 꼬리말·본문 서식을 다 갖춤)을 바탕으로 값만 바꾼다 (buildMimicTemplate)
//
// spec = { paperMm:{w,h}, marginsMm:{top,bottom,left,right}, columns:1|2, columnLine,
//          header:{cells:[{text, widthPct, align:'left'|'center'|'right', bold}], ruleBelow},
//          footer:{pageNumber:'dash'|'plain'|'none'}, bodyPt, titlePt }

import { readText, savePackage, HeaderEditor, geometry, roleCss, collectHeaderTexts, esc } from './hwpx.js';

const MM = 283.465; // HWPUNIT / mm
const PT_MM = 25.4 / 72;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const quant = (arr, q) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))];
};

/**
 * pdf.js 글자 조각 → 모양. items: [{s, x, y(위에서부터 글자 바닥선), w, h(글자 크기)}] (pt), W·H 쪽 크기(pt)
 */
export function specFromText(items, W, H) {
  const it = items.filter((t) => t.s && t.s.trim() && t.h > 2 && t.w > 0);
  const spec = {
    paperMm: { w: Math.round(W * PT_MM), h: Math.round(H * PT_MM) },
    marginsMm: { top: 15, bottom: 15, left: 15, right: 15 },
    columns: 1,
    columnLine: false,
    header: { cells: [], ruleBelow: true },
    footer: { pageNumber: 'none' },
    bodyPt: 10,
    titlePt: 16,
  };
  if (it.length < 5) return spec;

  // 본문 글자 크기: 글자 수로 가중한 가장 흔한 크기 (0.5pt 단위)
  const sizes = new Map();
  for (const t of it) {
    const k = Math.round(t.h * 2) / 2;
    sizes.set(k, (sizes.get(k) ?? 0) + t.s.length);
  }
  const body = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0][0];
  spec.bodyPt = clamp(body, 7, 14);

  // 쪽 번호: 맨 아래 8% 안의 숫자만 있는 조각
  const bottomBand = it.filter((t) => t.y > H * 0.92);
  const pn = bottomBand.find((t) => /^\s*[-–—]?\s*\d{1,3}\s*[-–—]?\s*$/.test(t.s) || /^\s*-\s*$/.test(t.s));
  if (pn) spec.footer.pageNumber = /[-–—]/.test(bottomBand.map((t) => t.s).join('')) ? 'dash' : 'plain';
  const content = it.filter((t) => !(pn && t.y > H * 0.92 && /^[\s\d\-–—]+$/.test(t.s)));

  // 여백: 글자 영역의 바깥 (튀는 조각은 빼고)
  const left = quant(content.map((t) => t.x), 0.01);
  const right = W - quant(content.map((t) => t.x + t.w), 0.99);
  const top = quant(content.map((t) => t.y - t.h), 0.005);
  const bottom = H - quant(content.map((t) => t.y), 0.995);
  const toMm = (v) => clamp(Math.round(v * PT_MM), 6, 35);
  spec.marginsMm = { left: toMm(left), right: toMm(right), top: toMm(top), bottom: toMm(bottom + (pn ? 0 : 0)) };

  // 단: 본문 크기 글줄이 가운데를 넘나들지 않고 양쪽에 고르게 있으면 2단
  const mid = W / 2;
  const bodyItems = content.filter((t) => Math.abs(t.h - body) <= 0.6 && t.y > H * 0.15);
  const L = bodyItems.filter((t) => t.x + t.w < mid - 4).length;
  const Rr = bodyItems.filter((t) => t.x > mid + 4).length;
  const cross = bodyItems.filter((t) => t.x < mid - 4 && t.x + t.w > mid + 4).length;
  if (bodyItems.length > 20 && cross / bodyItems.length < 0.06 && L / bodyItems.length > 0.25 && Rr / bodyItems.length > 0.25) spec.columns = 2;

  // 머리 줄: 맨 위 글줄(들) 가운데 본문보다 크거나, 쪽 맨 위 15% 안에서 좌·중·우로 흩어진 조각
  const firstY = Math.min(...content.map((t) => t.y));
  const headRow = content.filter((t) => t.y <= Math.max(firstY + body * 1.6, firstY) && t.y < H * 0.2);
  if (headRow.length) {
    const ordered = [...headRow].sort((a, b) => a.x - b.x);
    // 가까운 조각끼리 한 칸으로 묶는다 (사이가 글자 3개 넘게 비면 다른 칸)
    const groups = [];
    for (const t of ordered) {
      const g = groups[groups.length - 1];
      if (g && t.x - (g.x + g.w) < Math.max(t.h, body) * 3) {
        g.s += (t.x - (g.x + g.w) > t.h * 0.2 ? ' ' : '') + t.s;
        g.w = t.x + t.w - g.x;
        g.h = Math.max(g.h, t.h);
      } else groups.push({ ...t });
    }
    const bodyW = W - left - right;
    const cells = groups.slice(0, 4).map((g) => {
      const c = g.x + g.w / 2 - left;
      return { text: g.s.trim(), center: c / bodyW, h: g.h, align: c / bodyW < 0.3 ? 'left' : c / bodyW > 0.7 ? 'right' : 'center', bold: g.h > body * 1.15 };
    });
    spec.titlePt = clamp(Math.round(Math.max(...cells.map((c) => c.h)) * 2) / 2, body, 28);
    spec.header.cells = cellWidths(cells);
  }
  return spec;
}

/** 칸 가운데 위치(0~1) → 칸 너비 %: 이웃 칸과의 중간을 경계로 */
function cellWidths(cells) {
  if (cells.length === 1) return [{ ...cells[0], widthPct: 100, align: 'center' }];
  const cuts = [0];
  for (let i = 0; i < cells.length - 1; i++) cuts.push((cells[i].center + cells[i + 1].center) / 2);
  cuts.push(1);
  return cells.map((c, i) => ({ text: c.text, align: c.align, bold: c.bold, widthPct: Math.max(10, Math.round((cuts[i + 1] - cuts[i]) * 100)) }));
}

/** AI·글자층 값 정리 (빠진 값은 채우고 엉뚱한 값은 잘라 낸다) */
export function normalizeSpec(s = {}) {
  const m = s.marginsMm || {};
  const cells = (s.header?.cells || []).filter((c) => c && String(c.text ?? '').trim()).slice(0, 4);
  const sum = cells.reduce((a, c) => a + (+c.widthPct || 0), 0) || 1;
  return {
    paperMm: { w: clamp(+s.paperMm?.w || 210, 100, 420), h: clamp(+s.paperMm?.h || 297, 140, 600) },
    marginsMm: {
      top: clamp(+m.top || 15, 5, 40),
      bottom: clamp(+m.bottom || 15, 5, 40),
      left: clamp(+m.left || 15, 5, 40),
      right: clamp(+m.right || 15, 5, 40),
    },
    columns: +s.columns === 2 ? 2 : 1,
    columnLine: !!s.columnLine,
    pageBorder: !!s.pageBorder,
    header: {
      cells: cells.map((c) => ({
        text: String(c.text).trim().slice(0, 80),
        widthPct: Math.round(((+c.widthPct || 100 / cells.length) / sum) * 100),
        align: ['left', 'center', 'right'].includes(c.align) ? c.align : 'center',
        bold: !!c.bold,
      })),
      ruleBelow: s.header?.ruleBelow !== false,
    },
    footer: { pageNumber: ['dash', 'plain', 'none'].includes(s.footer?.pageNumber) ? s.footer.pageNumber : 'dash' },
    bodyPt: clamp(+s.bodyPt || 10, 7, 14),
    titlePt: clamp(+s.titlePt || 16, 9, 30),
  };
}

/** p0 안의 <hp:ctrl><hp:TAG …>…</hp:TAG></hp:ctrl> 범위 */
function ctrlRange(xml, tag) {
  const s = xml.indexOf(`<hp:ctrl><hp:${tag} `);
  if (s < 0) return null;
  const e = xml.indexOf(`</hp:${tag}></hp:ctrl>`, s);
  return e < 0 ? null : [s, e + `</hp:${tag}></hp:ctrl>`.length];
}

/**
 * 내장 샘플 양식 + spec → 새 양식 {bytes, analysis, head}
 * head = 미리보기용 머리 줄 정보 {cells:[{i, widthPct, align}], rule, pageNum}
 */
export function buildMimicTemplate(samplePkg, sampleAnalysis, rawSpec) {
  const spec = normalizeSpec(rawSpec);
  const pkg = { files: Object.fromEntries(Object.entries(samplePkg.files).map(([k, v]) => [k, v.slice()])) };
  const enc = new TextEncoder();
  const hdr = new HeaderEditor(readText(pkg, 'Contents/header.xml'));
  let sec = readText(pkg, 'Contents/section0.xml');

  const W = Math.round(spec.paperMm.w * MM);
  const H = Math.round(spec.paperMm.h * MM);
  const left = Math.round(spec.marginsMm.left * MM);
  const right = Math.round(spec.marginsMm.right * MM);
  const bodyW = W - left - right;
  const cells = spec.header.cells;
  const hasHead = cells.length > 0;
  const hasFoot = spec.footer.pageNumber !== 'none';

  // ── 머리 표: 샘플의 3칸(왼쪽=학교명 12pt 굵게, 가운데=자료명 18pt 굵게, 오른쪽=10pt)을 본보기로 칸을 다시 짠다
  const headR = ctrlRange(sec, 'header');
  let tblH = 0;
  if (headR) {
    let head = sec.slice(...headR);
    if (!hasHead) {
      sec = sec.slice(0, headR[0]) + sec.slice(headR[1]);
    } else {
      const tcs = [...head.matchAll(/<hp:tc\b[\s\S]*?<\/hp:tc>/g)].map((m) => m[0]);
      const proto = { left: tcs[0], center: tcs[1], right: tcs[2] };
      const none = hdr.noneBorder();
      tblH = +(/<hp:sz width="\d+" widthRelTo="ABSOLUTE" height="(\d+)"/.exec(head)?.[1] ?? 3356);
      let x = 0;
      const row = cells
        .map((c, i) => {
          const w = i === cells.length - 1 ? bodyW - x : Math.round((bodyW * c.widthPct) / 100);
          x += w;
          let tc = proto[c.align] || proto.center;
          tc = tc.replace(/<hp:t>[\s\S]*?<\/hp:t>|<hp:t\/>/, `<hp:t>${esc(c.text)}</hp:t>`);
          tc = tc.replace(/<hp:cellAddr colAddr="\d+"/, `<hp:cellAddr colAddr="${i}"`);
          tc = tc.replace(/<hp:cellSz width="\d+"/, `<hp:cellSz width="${w}"`);
          // 가운데(제목) 칸 글자 크기는 원본 제목 크기로
          if (c.align === 'center') {
            tc = tc.replace(/<hp:run charPrIDRef="(\d+)">(<hp:t>)/,(all, id, t) => `<hp:run charPrIDRef="${hdr.charPr(id, { size: Math.round(spec.titlePt * 100) })}">${t}`);
          }
          if (!spec.header.ruleBelow) tc = tc.replace(/(<hp:tc\b[^>]*\bborderFillIDRef=")\d+"/, `$1${none}"`);
          return tc;
        })
        .join('');
      head = head.replace(/<hp:tr>[\s\S]*<\/hp:tr>/, `<hp:tr>${row}</hp:tr>`);
      head = head.replace(/\bcolCnt="\d+"/, `colCnt="${cells.length}"`);
      head = head.replace(/(<hp:sz width=")\d+(" widthRelTo="ABSOLUTE" height=")/, `$1${bodyW}$2`);
      head = head.replace(/\btextWidth="\d+"/, `textWidth="${bodyW}"`);
      sec = sec.slice(0, headR[0]) + head + sec.slice(headR[1]);
    }
  }
  // ── 꼬리말 쪽 번호
  const footR = ctrlRange(sec, 'footer');
  if (footR) {
    let foot = sec.slice(...footR);
    if (!hasFoot) sec = sec.slice(0, footR[0]) + sec.slice(footR[1]);
    else {
      if (spec.footer.pageNumber === 'plain') foot = foot.replace('<hp:t>- </hp:t>', '<hp:t/>').replace('<hp:t> -</hp:t>', '<hp:t/>');
      foot = foot.replace(/\btextWidth="\d+"/, `textWidth="${bodyW}"`);
      sec = sec.slice(0, footR[0]) + foot + sec.slice(footR[1]);
    }
  }

  // ── 쪽 크기·여백: 머리말은 위 여백 안쪽에서 시작하고(머리 표 높이 + 아래 틈), 본문은 그 아래
  const headerH = hasHead ? tblH + 1134 : 0;
  const footerH = hasFoot ? 2835 : 0;
  const top = Math.round(spec.marginsMm.top * MM);
  const bottom = Math.max(1400, Math.round(spec.marginsMm.bottom * MM) - (hasFoot ? Math.round(footerH * 0.4) : 0));
  sec = sec.replace(/<hp:pagePr\b[^>]*>/, (t) => t.replace(/\bwidth="\d+"/, `width="${W}"`).replace(/\bheight="\d+"/, `height="${H}"`));
  sec = sec.replace(
    /<hp:margin header="\d+" footer="\d+" gutter="\d+" left="\d+" right="\d+" top="\d+" bottom="\d+"\/>/,
    `<hp:margin header="${headerH}" footer="${footerH}" gutter="0" left="${left}" right="${right}" top="${top}" bottom="${bottom}"/>`,
  );
  // 쪽 테두리
  if (spec.pageBorder) {
    const bf = hdr.boxBorder();
    sec = sec.replace(/(<hp:pageBorderFill type="BOTH" borderFillIDRef=")\d+"/, `$1${bf}"`);
  }
  // ── 단
  sec = sec.replace(/(<hp:colPr\b[^>]*\bcolCount=")\d+"/, `$1${spec.columns}"`);
  sec = sec.replace(/(<hp:colLine type=")[A-Z_]+"/, `$1${spec.columns === 2 && spec.columnLine ? 'SOLID' : 'NONE'}"`);

  // ── 본문 글자 크기: 배운 역할 서식의 글자 모양을 원본 크기로 파생
  const size = Math.round(spec.bodyPt * 100);
  const profile = JSON.parse(JSON.stringify(sampleAnalysis.profile));
  for (const r of ['body', 'list', 'list2', 'list3', 'spacer']) {
    if (profile[r]?.charPr) profile[r].charPr = hdr.charPr(profile[r].charPr, { size });
  }

  pkg.files['Contents/section0.xml'] = enc.encode(sec);
  pkg.files['Contents/header.xml'] = enc.encode(hdr.xml);
  const headerTexts = collectHeaderTexts(pkg);
  const analysis = {
    ...sampleAnalysis,
    profile,
    css: roleCss(hdr.xml, profile),
    geometry: geometry(sec),
    headerTexts,
    stats: { paragraphs: 0, body: 0, list: 0, heading: 0 },
  };
  // 미리보기용: 머리 표 칸 글자가 headerTexts 의 몇 번째인지 (꼬리말 문구가 앞에 올 수 있다)
  const head = {
    cells: cells.map((c) => ({ i: headerTexts.findIndex((h) => h.text === c.text), widthPct: c.widthPct, align: c.align, ...(c.align === 'center' ? { size: spec.titlePt } : {}) })),
    rule: spec.header.ruleBelow,
    pageNum: spec.footer.pageNumber,
    border: spec.pageBorder,
  };
  return { bytes: savePackage(pkg), analysis, head, spec };
}

/** 사람이 읽는 요약: "A4 · 2단 · 머리 3칸 · 본문 10pt" */
export function specSummary(raw) {
  const s = normalizeSpec(raw);
  const paper =
    Math.abs(s.paperMm.w - 210) < 4 && Math.abs(s.paperMm.h - 297) < 4 ? 'A4' : Math.abs(s.paperMm.w - 257) < 5 && Math.abs(s.paperMm.h - 364) < 6 ? 'B4' : `${s.paperMm.w}×${s.paperMm.h}mm`;
  return [paper, `${s.columns}단`, s.header.cells.length ? `머리 ${s.header.cells.length}칸` : '머리 없음', `본문 ${s.bodyPt}pt`].join(' · ');
}
