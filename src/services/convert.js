// 변환 파이프라인: 올린 파일·붙여넣은 글 → 학습자료 문서
import { assemble, importJson, newDoc } from '../model.js';
import { parseText } from '../engine/textParser.js';
import { hwpxToText, hwpxImages } from '../engine/hwpxReader.js';
import { openPdf, renderPage, pageText, cropFigure, imageFileToPage, loadImage } from './pdf.js';
import { recognizePage, structureText } from './gemini.js';

export function fileKind(name) {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) return 'image';
  if (ext === 'hwpx') return 'hwpx';
  if (ext === 'json') return 'json';
  if (['txt', 'md', 'markdown', 'text'].includes(ext)) return 'text';
  // 예전 hwp·hml·워드·엑셀은 kordoc(문서→마크다운)으로 읽는다
  if (['hwp', 'hml', 'hwpml', 'docx', 'xlsx', 'xls'].includes(ext)) return 'office';
  return 'unknown';
}

/**
 * @param {object} o
 * @param {File[]} o.files
 * @param {string} o.text          붙여넣은 글
 * @param {object} o.settings      {apiKey, model, handwriting, engine}
 * @param {(ev)=>void} o.onProgress {stage, page, total, status, message}
 * @returns {Promise<{doc, pages:[{dataUrl,width,height}], engineUsed}>}
 */
export async function convert({ files = [], text = '', settings, title, onProgress = () => {}, signal }) {
  const blocks = [];
  const pages = [];
  const hasKey = !!settings.apiKey;
  const engine = settings.engine || 'auto';
  const useAiForImages = engine !== 'rules' && hasKey;
  let engineUsed = 'rules';
  let docFromJson = null;

  const aiPage = async (pg, i, total) => {
    onProgress({ stage: 'ai', page: i + 1, total, status: 'running', message: `${i + 1}/${total}쪽 AI 인식 중` });
    const bs = await recognizePage({
      key: settings.apiKey,
      model: settings.model,
      dataUrl: pg.dataUrl,
      pageNo: i + 1,
      totalPages: total,
      handwriting: settings.handwriting,
      subject: title,
      signal,
      onRetry: (sec, code) =>
        onProgress({ stage: 'ai', page: i + 1, total, status: 'waiting', message: `사용량 한도(${code}) — ${sec}초 뒤 다시 시도` }),
    });
    for (const b of bs) {
      b.page = pages.indexOf(pg);
      if (b.type === 'figure' && Array.isArray(b.box_2d) && b.box_2d.length === 4) {
        b.figure = await cropFigure(pg.dataUrl, b.box_2d, pg.mmW);
      }
      blocks.push(b);
    }
    onProgress({ stage: 'ai', page: i + 1, total, status: 'done', message: `${i + 1}/${total}쪽 완료 (${bs.length}개 블록)` });
  };

  for (const file of files) {
    const kind = fileKind(file.name);
    if (kind === 'unknown') throw new Error(`${file.name}: 지원하지 않는 파일입니다 (pdf, hwp, hwpx, docx, xlsx, txt, md, json, 이미지)`);

    if (kind === 'json') {
      docFromJson = importJson(JSON.parse(await file.text()));
      continue;
    }
    if (kind === 'office') {
      onProgress({ stage: 'render', status: 'running', message: `${file.name} 읽는 중 (kordoc)` });
      if (engineUsed !== 'ai') engineUsed = 'kordoc';
      const kd = await kordocParse(await file.arrayBuffer(), file.name);
      await textToBlocks(kd.markdown, kd.images);
      continue;
    }
    if (kind === 'hwpx') {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await textToBlocks(hwpxToText(bytes), hwpxImages(bytes));
      continue;
    }
    if (kind === 'text') {
      await textToBlocks(await file.text());
      continue;
    }
    if (kind === 'image') {
      onProgress({ stage: 'render', message: `${file.name} 불러오는 중` });
      const pg = await imageFileToPage(file);
      pages.push(pg);
      if (!useAiForImages) throw new Error('사진·스캔 이미지는 AI 인식이 필요합니다. 설정에서 무료 Gemini 키를 넣어 주세요.');
      engineUsed = 'ai';
      await aiPage(pg, 0, 1);
      continue;
    }
    // PDF
    const pdf = await openPdf(new Uint8Array(await file.arrayBuffer()));
    const total = pdf.numPages;
    const local = [];
    let textChars = 0;
    const texts = [];
    for (let n = 1; n <= total; n++) {
      if (signal?.aborted) throw new DOMException('취소됨', 'AbortError');
      onProgress({ stage: 'render', page: n, total, status: 'running', message: `${n}/${total}쪽 읽는 중` });
      // AI 인식용은 선명하게, 규칙 인식(원본 대조용)은 가볍게
      const pg = await renderPage(pdf, n, useAiForImages || engine === 'ai' ? 1800 : 1100);
      pages.push(pg);
      local.push(pg);
      const t = await pageText(pdf, n);
      textChars += t.chars;
      texts.push(t.text);
    }
    pdf.loadingTask?.destroy?.(); // 쪽 그림·글자는 다 뽑았으니 pdf.js 메모리 정리
    const scanned = textChars < total * 80; // 글자층이 거의 없으면 스캔본
    // 글자 있는 PDF 는 kordoc 이 이 컴퓨터 안에서 빠르게 (제목·목록·표·밑줄까지) — 'AI 정밀'을 고를 때만 Gemini
    const wantAi = engine === 'ai';
    if (wantAi || scanned) {
      if (!hasKey) {
        throw new Error('스캔본(또는 손글씨) PDF 는 AI 인식이 필요합니다. 설정에서 무료 Gemini API 키를 넣어 주세요.');
      }
      engineUsed = 'ai';
      for (let i = 0; i < local.length; i++) {
        if (signal?.aborted) throw new DOMException('취소됨', 'AbortError');
        await aiPage(local[i], i, local.length);
      }
    } else {
      let kd = null;
      try {
        onProgress({ stage: 'render', status: 'running', message: `${file.name} 구조 읽는 중 (kordoc)` });
        kd = await kordocParse(await file.arrayBuffer(), file.name);
        if (engineUsed !== 'ai') engineUsed = 'kordoc';
      } catch (e) {
        console.warn('kordoc 실패 — 쪽 글자층으로 대신 읽음', e);
      }
      if (kd?.markdown.trim()) blocks.push(...(await withFigures(parseText(kd.markdown), kd.images)));
      else {
        const base = pages.length - local.length;
        texts.forEach((t, i) => {
          for (const b of parseText(t)) blocks.push({ ...b, page: base + i });
        });
      }
    }
  }

  if (text.trim()) await textToBlocks(text);

  async function textToBlocks(t, images = []) {
    if (engine === 'ai' && hasKey) {
      engineUsed = 'ai';
      onProgress({ stage: 'ai', status: 'running', message: 'AI 가 글의 구조를 정리하는 중' });
      // 너무 긴 글은 나눠서
      const chunks = splitChunks(t, 12000);
      for (let i = 0; i < chunks.length; i++) {
        blocks.push(...(await structureText({ key: settings.apiKey, model: settings.model, text: chunks[i], subject: title, signal })));
        onProgress({ stage: 'ai', page: i + 1, total: chunks.length, status: 'done', message: `${i + 1}/${chunks.length} 묶음 정리` });
      }
    } else {
      blocks.push(...(await withFigures(parseText(t), images)));
    }
  }

  const doc = docFromJson ?? newDoc(title || '새 학습자료');
  if (!docFromJson || blocks.length) doc.blocks = [...(docFromJson?.blocks ?? []), ...assemble(blocks)];
  if (title) doc.title = title;
  onProgress({ stage: 'done', message: `내용 ${doc.blocks.length}덩이를 정리했습니다` });
  return { doc, pages, engineUsed };
}

/** kordoc(https://github.com/KKHLAND/kordoc, MIT) 으로 문서 → {마크다운, 그림}. 필요할 때만 불러온다(약 900KB). */
let kordocMod = null;
async function kordocParse(buffer, name) {
  kordocMod ??= import('../vendor/kordoc/kordoc.browser.js').catch((e) => {
    kordocMod = null; // 불러오기 실패는 다음에 다시 시도
    throw e;
  });
  const { parse } = await kordocMod;
  const r = await parse(buffer instanceof ArrayBuffer ? buffer : buffer.buffer, { images: true });
  if (!r?.success) {
    const msg = r?.code === 'ENCRYPTED' || /암호|password/i.test(r?.error || '') ? '암호가 걸린 문서입니다. 한글에서 암호를 푼 뒤 올려 주세요.' : r?.error || '읽지 못했습니다';
    throw new Error(`${name}: ${msg}`);
  }
  return { markdown: r.markdown || '', images: r.images || [] };
}

/**
 * 그림 자리표(figureRef)에 kordoc 이 꺼낸 그림을 붙인다. 한글이 바로 쓰는 PNG·JPEG 로 맞추고
 * (BMP·GIF 등은 브라우저로 그려 PNG 로), 그릴 수 없는 그림(WMF·EMF 등)과 짝 없는 자리표는 뺀다.
 */
async function withFigures(blocks, images = []) {
  if (!blocks.some((b) => b.figureRef)) return blocks;
  const byName = new Map(images.map((im) => [im.filename, im]));
  const out = [];
  for (const b of blocks) {
    if (!b.figureRef) {
      out.push(b);
      continue;
    }
    const im = byName.get(b.figureRef) ?? byName.get(decodeURIComponent(b.figureRef));
    const fig = im ? await imageToFigure(im).catch(() => null) : null;
    if (fig) out.push({ type: 'figure', text: b.text || '', figure: fig });
  }
  return out;
}

async function imageToFigure({ data, mimeType }) {
  const blob = new Blob([data], { type: mimeType || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    if (!img.width || !img.height || (img.width < 8 && img.height < 8)) return null;
    let src;
    if (/^image\/(png|jpe?g)$/i.test(mimeType)) {
      src = await new Promise((res) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.readAsDataURL(blob);
      });
      src = src.replace(/^data:image\/jpg;/, 'data:image/jpeg;');
    } else {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      src = c.toDataURL('image/png');
    }
    return { src, w: img.width, h: img.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function splitChunks(t, size) {
  const out = [];
  let cur = '';
  for (const para of t.split(/\n(?=\s*(?:\d{1,3}\s*[.．]|\[\d))/)) {
    if (cur.length + para.length > size && cur) {
      out.push(cur);
      cur = '';
    }
    cur += (cur ? '\n' : '') + para;
  }
  if (cur) out.push(cur);
  return out;
}
