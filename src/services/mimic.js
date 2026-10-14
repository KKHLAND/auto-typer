// 원본 모양 따라 만들기: 올린 PDF·사진 첫 쪽 → 새 양식(저장까지)
import { openPdf, renderPage, imageFileToPage } from './pdf.js';
import { readLayout } from './gemini.js';
import { specFromText, normalizeSpec, buildMimicTemplate, specSummary } from '../engine/mimic.js';
import { loadTemplate, addTemplateBytes } from './templates.js';
import { fileKind } from './convert.js';

/** 쪽 사진 비율로 용지 크기 어림 (글자층이 없고 AI 도 없을 때) */
function paperFromAspect(w, h) {
  const r = h / w;
  if (Math.abs(r - 364 / 257) < 0.02 && w > h * 0.5) return { w: 257, h: 364 }; // B4 (A4 와 비율이 같아 기본은 A4)
  return Math.abs(r - 297 / 210) < 0.06 ? { w: 210, h: 297 } : { w: 210, h: Math.round(210 * r) };
}

/**
 * @returns {Promise<{id, name, summary, spec}>}
 */
export async function mimicTemplate({ file, settings, signal }) {
  const kind = fileKind(file.name);
  let page;
  let textSpec = null;
  if (kind === 'pdf') {
    const pdf = await openPdf(new Uint8Array(await file.arrayBuffer()));
    const pg = await pdf.getPage(1);
    const vp = pg.getViewport({ scale: 1 });
    const tc = await pg.getTextContent();
    const items = tc.items
      .filter((t) => t.str !== undefined)
      .map((t) => ({ s: t.str, x: t.transform[4], y: vp.height - t.transform[5], w: t.width, h: Math.hypot(t.transform[2], t.transform[3]) || t.height }));
    if (items.reduce((n, t) => n + t.s.trim().length, 0) > 80) textSpec = specFromText(items, vp.width, vp.height);
    else textSpec = { paperMm: { w: Math.round((vp.width * 25.4) / 72), h: Math.round((vp.height * 25.4) / 72) } };
    page = await renderPage(pdf, 1, 1600);
    pdf.loadingTask?.destroy?.();
  } else if (kind === 'image') {
    page = await imageFileToPage(file, 1600);
    textSpec = { paperMm: paperFromAspect(page.width, page.height) };
  } else {
    throw new Error('원본 모양 따라 만들기는 PDF 나 사진으로 올린 자료에서만 할 수 있습니다.');
  }
  if (signal?.aborted) throw new DOMException('취소됨', 'AbortError');

  let spec = textSpec;
  if (settings.apiKey) {
    try {
      const ai = await readLayout({ key: settings.apiKey, model: settings.model, dataUrl: page.dataUrl, signal });
      // 글자층에서 잰 값(용지·여백·글자 크기·단)은 정확하니 우선, 선·테두리처럼 그림으로만 보이는 것은 AI 값
      const hasText = !!textSpec?.marginsMm;
      spec = {
        ...ai,
        paperMm: textSpec?.paperMm ?? ai.paperMm,
        ...(hasText ? { marginsMm: textSpec.marginsMm, bodyPt: textSpec.bodyPt, columns: textSpec.columns } : {}),
        header: ai.header?.cells?.length || !hasText ? ai.header : textSpec.header,
      };
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      console.warn('AI 모양 읽기 실패 — 글자 위치로만 본뜸', e);
    }
  }
  spec = normalizeSpec(spec);
  const base = await loadTemplate('sample');
  const built = buildMimicTemplate(base.pkg, base.analysis, spec);
  const name = `${file.name.replace(/\.[^.]+$/, '')} 모양`;
  const summary = specSummary(spec);
  const { meta } = await addTemplateBytes(built.bytes, name, { theme: 'mimic', head: built.head, desc: `원본 모양 · ${summary}`, keep: false, color: '#7a5af8' }, built);
  return { id: meta.id, name, summary, spec };
}
