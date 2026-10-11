// 변환 파이프라인: 올린 파일·붙여넣은 글 → 학습자료 문서
import { assemble, importJson, newDoc, newBlock, docToMarkdown, markGuesses, fixSymbols } from '../model.js';
import { parseText } from '../engine/textParser.js';
import { formatPuaMathLines } from '../engine/hwpPua.js';
import { hwpxToText, hwpxImages } from '../engine/hwpxReader.js';
import { openPdf, renderPage, pageText, cropFigure, cropContext, imageFileToPage, loadImage } from './pdf.js';
import { recognizePage, structureText, refineFigureBox, fillFormPages } from './gemini.js';

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
  const markdowns = [];
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
    // 그림: 쪽 전체를 읽으며 잡은 상자는 대략적이라(옆 문장이 걸리거나 이름표가 잘림) 그림 둘레를 넉넉히 다시 잘라
    // AI 에게 그림만 담는 상자를 한 번 더 묻는다. 자르기는 원본 픽셀 그대로라 그림 자체는 바뀌지 않는다.
    const figs = bs.filter((b) => b.type === 'figure' && Array.isArray(b.box_2d) && b.box_2d.length === 4);
    if (figs.length) onProgress({ stage: 'ai', page: i + 1, total, status: 'running', message: `${i + 1}/${total}쪽 그림 ${figs.length}개 다듬는 중` });
    await Promise.all(
      figs.map(async (b) => {
        let box = b.box_2d;
        let pad = 0.012;
        try {
          const ctx = await cropContext(pg.dataUrl, box);
          const fine = await refineFigureBox({ key: settings.apiKey, model: settings.model, dataUrl: ctx.src, signal });
          if (fine) {
            box = ctx.map(fine);
            pad = 0.02; // 다시 잡은 상자 둘레로 이름표가 들어갈 여유 (옆 글줄·조각은 cleanFigure 가 지운다)
          }
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          console.warn('그림 상자 다듬기 실패 — 처음 상자로 자름', e);
        }
        // 자르는 범위는 처음 상자 ∪ 다시 잡은 상자 — 다시 잡은 상자가 빠뜨린 이름표(축 이름 y 등)는
        // cropFigure 의 정리 단계가 '그림 선 곁의 외톨이 글자'로 알아보고 살린다
        const outer = box === b.box_2d ? null : b.box_2d;
        b.figure = await cropFigure(pg.dataUrl, box, pg.mmW, { pad, outer });
        if (b.figure) Object.assign(b.figure, { box, outer }); // 나중에 다시 자를 때
      }),
    );
    // 시험지처럼 그림이 문항 글 오른쪽에 있으면 AI 가 그림을 문항보다 먼저 내놓는다 → 그 문항 발문 바로 뒤로
    for (let k = 0; k < bs.length - 1; k++) {
      if (bs[k].type === 'figure' && bs[k + 1].type === 'list' && (bs[k + 1].level || 1) === 1) {
        [bs[k], bs[k + 1]] = [bs[k + 1], bs[k]];
        k++;
      }
    }
    for (const b of bs) {
      b.page = pages.indexOf(pg);
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
      if (kd?.markdown) markdowns.push(kd.markdown);
      await textToBlocks(kd.markdown, kd.images);
      continue;
    }
    if (kind === 'hwpx') {
      onProgress({ stage: 'render', status: 'running', message: `${file.name} 읽는 중 (kordoc)` });
      try {
        const kd = await kordocParse(await file.arrayBuffer(), file.name);
        if (engineUsed !== 'ai') engineUsed = 'kordoc';
        if (kd?.markdown) markdowns.push(kd.markdown);
        await textToBlocks(kd.markdown, kd.images);
      } catch (e) {
        console.warn('kordoc hwpx 실패 — 내장 hwpx 리더로 대체', e);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const t = hwpxToText(bytes);
        if (t) markdowns.push(t);
        await textToBlocks(t, hwpxImages(bytes));
      }
      continue;
    }
    if (kind === 'text') {
      const txt = await file.text();
      if (txt) markdowns.push(txt);
      await textToBlocks(txt);
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
    let totalPua = 0;
    let pagesWithImages = 0;
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
      totalPua += t.puaCount || 0;
      if (t.hasImage) pagesWithImages++;
      texts.push(t.text);
    }
    pdf.loadingTask?.destroy?.(); // 쪽 그림·글자는 다 뽑았으니 pdf.js 메모리 정리
    const fullText = texts.join(' ');
    const scanned = textChars < total * 80; // 글자층이 거의 없으면 스캔본
    const hasOriginalImages = pagesWithImages > 0 || scanned;
    // 수학 수식 시험지 판정 (PUA 수식 글꼴이 많거나 시험지 고유 문구 포함)
    const isMathOrExam = totalPua >= 10 || /수학\s*영역|[\[【]\s*[234]\s*점\s*[\]】]|홀수형|짝수형|5지선다형|대학수학능력시험/.test(fullText);

    const isAutoHandwriting = (settings.handwriting || 'auto') === 'auto';
    const wantAi = engine === 'ai';

    // 손글씨 처리 기본값 '자동'일 때:
    // 원본에 이미지가 있는 경우에만 이미지/AI 처리를 돌리고,
    // 나머지 텍스트만 있을 때는 로컬 파서를 이용해 빠르고 정확하게 처리한다.
    let shouldRunAi = false;
    if (wantAi) {
      shouldRunAi = true;
    } else if (engine === 'rules') {
      shouldRunAi = false;
    } else if (hasKey) {
      if (isAutoHandwriting) {
        // 원본에 이미지가 있는 경우에만 AI 이미지/문서 처리 실행
        shouldRunAi = hasOriginalImages;
      } else {
        shouldRunAi = scanned || isMathOrExam;
      }
    }

    if (shouldRunAi) {
      if (!hasKey) {
        throw new Error('원본에 이미지가 포함된 문서는 AI 정밀 인식이 필요합니다. 설정에서 무료 Gemini API 키를 넣어 주세요.');
      }
      engineUsed = 'ai';
      for (let i = 0; i < local.length; i++) {
        if (signal?.aborted) throw new DOMException('취소됨', 'AbortError');
        await aiPage(local[i], i, local.length);
      }
    } else {
      onProgress({
        stage: 'render',
        status: 'running',
        message: `${file.name} 빠른 파싱 중 (kordoc 엔진)`,
      });
      let kd = null;
      try {
        onProgress({ stage: 'render', status: 'running', message: `${file.name} 구조 읽는 중 (kordoc)` });
        kd = await kordocParse(await file.arrayBuffer(), file.name);
        if (engineUsed !== 'ai') engineUsed = 'kordoc';
      } catch (e) {
        console.warn('kordoc 실패 — 쪽 글자층으로 대신 읽음', e);
      }
      if (kd?.markdown?.trim()) {
        const mdText = isMathOrExam ? formatPuaMathLines(kd.markdown) : kd.markdown;
        markdowns.push(mdText);
        blocks.push(...(await withFigures(parseText(mdText), kd.images)));
      } else {
        const base = pages.length - local.length;
        const pageMds = [];
        texts.forEach((t, i) => {
          const formatted = isMathOrExam ? formatPuaMathLines(t) : t;
          pageMds.push(formatted);
          for (const b of parseText(formatted)) blocks.push({ ...b, page: base + i });
        });
        if (pageMds.length) markdowns.push(pageMds.join('\n\n'));
      }
    }
  }

  if (text.trim()) {
    markdowns.push(text);
    await textToBlocks(text);
  }

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
  const rawMarkdown = markdowns.filter(Boolean).join('\n\n---\n\n') || docToMarkdown(doc);
  onProgress({ stage: 'done', message: `내용 ${doc.blocks.length}덩이를 정리했습니다` });
  return { doc, pages, engineUsed, markdown: rawMarkdown };
}

/**
 * 채움 양식: 학생 답안지 스캔(PDF·사진) → 학생마다 양식 칸에 채울 값
 * @param o.entry      loadTemplate 결과 (entry.form = {pkg, slots, outline})
 * @param o.perRecord  학생 한 명의 쪽 수
 * @returns {Promise<{doc, pages, engineUsed}>}
 */
export async function convertFill({ files = [], entry, perRecord = 1, settings, title, onProgress = () => {}, signal }) {
  if (!settings.apiKey) throw new Error('학생 답안지를 칸에 채우려면 AI 인식이 필요합니다. 설정에서 무료 Gemini 키를 넣어 주세요.');
  const form = entry.form;
  const slots = form.slots.filter((s) => !s.off);
  if (!slots.length) throw new Error('이 양식에서 채울 칸이 모두 꺼져 있습니다. [양식] 메뉴에서 칸을 켜 주세요.');
  const pages = [];
  for (const file of files) {
    const kind = fileKind(file.name);
    if (kind === 'image') {
      onProgress({ stage: 'render', message: `${file.name} 불러오는 중` });
      pages.push(await imageFileToPage(file));
    } else if (kind === 'pdf') {
      const pdf = await openPdf(new Uint8Array(await file.arrayBuffer()));
      for (let n = 1; n <= pdf.numPages; n++) {
        if (signal?.aborted) throw new DOMException('취소됨', 'AbortError');
        onProgress({ stage: 'render', page: n, total: pdf.numPages, status: 'running', message: `${file.name} ${n}/${pdf.numPages}쪽 읽는 중` });
        pages.push(await renderPage(pdf, n, 1800));
      }
      pdf.loadingTask?.destroy?.();
    } else {
      throw new Error(`${file.name}: 답안지는 PDF(스캔본) 또는 사진(JPG·PNG)으로 올려 주세요.`);
    }
  }
  if (!pages.length) throw new Error('답안지 파일을 올려 주세요.');
  const n = Math.max(1, Math.round(perRecord) || 1);
  const groups = [];
  for (let i = 0; i < pages.length; i += n) groups.push(pages.slice(i, i + n));

  const blocks = [];
  for (let r = 0; r < groups.length; r++) {
    if (signal?.aborted) throw new DOMException('취소됨', 'AbortError');
    onProgress({ stage: 'ai', page: r + 1, total: groups.length, status: 'running', message: `학생 ${r + 1}/${groups.length} 답안 읽는 중` });
    const res = await fillFormPages({
      key: settings.apiKey,
      model: settings.model,
      dataUrls: groups[r].map((p) => p.dataUrl),
      slots,
      outline: form.outline,
      subject: title,
      signal,
      onRetry: (sec, code) => onProgress({ stage: 'ai', page: r + 1, total: groups.length, status: 'waiting', message: `사용량 한도(${code}) — ${sec}초 뒤 다시 시도` }),
    });
    const page = r * n;
    for (const s of slots) {
      const v = res.values[s.id] || { text: '', guessed: [] };
      const text = markGuesses(fixSymbols(v.text), v.guessed).trim();
      blocks.push({ ...newBlock('paragraph', { text, page }), slot: s.id, rec: r, label: s.label, flag: /⟪/.test(text) ? 'check' : 'todo' });
    }
    if (res.extra) blocks.push({ ...newBlock('paragraph', { text: fixSymbols(res.extra), page }), slot: null, rec: r, label: '칸 밖 글씨', flag: 'check' });
    onProgress({ stage: 'ai', page: r + 1, total: groups.length, status: 'done', message: `학생 ${r + 1}/${groups.length} 완료` });
  }
  const doc = newDoc(title || entry.meta.name);
  doc.fill = { templateId: entry.meta.id, perRecord: n, records: groups.length };
  doc.blocks = blocks;
  onProgress({ stage: 'done', message: `학생 ${groups.length}명의 답안을 칸에 채웠습니다` });
  return { doc, pages, engineUsed: 'ai', markdown: '' };
}

/** kordoc(https://github.com/KKHLAND/kordoc, MIT) 으로 문서 → {마크다운, 그림}. 필요할 때만 불러온다(약 900KB). */
let kordocMod = null;
async function kordocParse(buffer, name) {
  kordocMod ??= import('../vendor/kordoc/kordoc.browser.js').catch((e) => {
    kordocMod = null; // 불러오기 실패는 다음에 다시 시도
    throw e;
  });
  const { parse } = await kordocMod;
  let targetBuf;
  if (buffer instanceof ArrayBuffer) {
    targetBuf = buffer;
  } else if (ArrayBuffer.isView(buffer)) {
    targetBuf =
      buffer.byteOffset === 0 && buffer.byteLength === buffer.buffer.byteLength
        ? buffer.buffer
        : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  } else {
    targetBuf = buffer;
  }
  const r = await parse(targetBuf, { fileName: name, images: true });
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
