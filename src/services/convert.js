// 변환 파이프라인: 올린 파일·붙여넣은 글 → 학습자료 문서
import { assemble, importJson, newDoc } from '../model.js';
import { parseText } from '../engine/textParser.js';
import { hwpxToText } from '../engine/hwpxReader.js';
import { openPdf, renderPage, pageText, cropFigure, imageFileToPage } from './pdf.js';
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
        b.figure = await cropFigure(pg.dataUrl, b.box_2d);
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
      await textToBlocks(await kordocMarkdown(await file.arrayBuffer(), file.name));
      continue;
    }
    if (kind === 'text' || kind === 'hwpx') {
      const t = kind === 'hwpx' ? hwpxToText(new Uint8Array(await file.arrayBuffer())) : await file.text();
      await textToBlocks(t);
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
      let md = null;
      try {
        onProgress({ stage: 'render', status: 'running', message: `${file.name} 구조 읽는 중 (kordoc)` });
        md = await kordocMarkdown(await file.arrayBuffer(), file.name);
        if (engineUsed !== 'ai') engineUsed = 'kordoc';
      } catch (e) {
        console.warn('kordoc 실패 — 쪽 글자층으로 대신 읽음', e);
      }
      if (md && md.trim()) blocks.push(...parseText(md));
      else {
        const base = pages.length - local.length;
        texts.forEach((t, i) => {
          for (const b of parseText(t)) blocks.push({ ...b, page: base + i });
        });
      }
    }
  }

  if (text.trim()) await textToBlocks(text);

  async function textToBlocks(t) {
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
      blocks.push(...parseText(t));
    }
  }

  const doc = docFromJson ?? newDoc(title || '새 학습자료');
  if (!docFromJson || blocks.length) doc.blocks = [...(docFromJson?.blocks ?? []), ...assemble(blocks)];
  if (title) doc.title = title;
  onProgress({ stage: 'done', message: `내용 ${doc.blocks.length}덩이를 정리했습니다` });
  return { doc, pages, engineUsed };
}

/** kordoc(https://github.com/KKHLAND/kordoc, MIT) 으로 문서 → 마크다운. 필요할 때만 불러온다(약 900KB). */
let kordocMod = null;
async function kordocMarkdown(buffer, name) {
  kordocMod ??= import('../vendor/kordoc/kordoc.browser.js').catch((e) => {
    kordocMod = null; // 불러오기 실패는 다음에 다시 시도
    throw e;
  });
  const { parse } = await kordocMod;
  const r = await parse(buffer instanceof ArrayBuffer ? buffer : buffer.buffer, { images: false });
  if (!r?.success) {
    const msg = r?.code === 'ENCRYPTED' || /암호|password/i.test(r?.error || '') ? '암호가 걸린 문서입니다. 한글에서 암호를 푼 뒤 올려 주세요.' : r?.error || '읽지 못했습니다';
    throw new Error(`${name}: ${msg}`);
  }
  return r.markdown || '';
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
