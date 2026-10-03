import { useEffect, useRef, useState } from 'react';
import { layout, printPages } from '../preview/paper.js';

/**
 * 실제로 적용할 머리 문구 수정: 선생님이 고친 값 + (고치지 않았다면) 학습 자료명 칸에 문서 이름
 * hwpx 만들기와 미리보기가 같은 값을 쓴다.
 */
export function effectiveEdits(entry, doc) {
  const edits = { ...(doc.headerEdits?.[entry.meta.id] || {}) };
  const ti = entry.meta.titleIndex;
  const h = ti != null ? entry.headerTexts[ti] : null;
  if (h && !(h.key in edits) && doc.title?.trim()) edits[h.key] = doc.title.trim();
  return edits;
}

/** 양식 항목 + 문서의 머리 문구 수정 → 문구 배열 */
export function headerStrings(entry, doc) {
  const edits = effectiveEdits(entry, doc);
  return entry.headerTexts.map((h) => edits[h.key] ?? h.text);
}

/** 조판된 지면 미리보기 */
export default function Preview({ doc, entry, zoom = 0.8, onPages, onPick, hostId }) {
  const host = useRef(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!entry) return;
    let alive = true;
    setBusy(true);
    const t = setTimeout(async () => {
      if (!host.current) return;
      const n = await layout(host.current, {
        doc,
        geometry: entry.analysis.geometry,
        css: entry.analysis.css,
        theme: entry.meta.theme,
        headerTexts: headerStrings(entry, doc),
      });
      if (alive) {
        setBusy(false);
        onPages?.(n);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [doc, entry]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="preview-wrap" onClick={(e) => {
      const u = e.target.closest?.('.u');
      if (u && onPick) onPick(u.dataset.id);
    }}>
      {busy && <div className="loading"><span className="spin" /> 조판 중…</div>}
      <div className="preview-scale" style={{ transform: `scale(${zoom})`, height: busy ? 0 : undefined, overflow: busy ? 'hidden' : undefined }}>
        <div ref={host} id={hostId} />
      </div>
    </div>
  );
}

/** 화면에 없어도 조판해서 바로 인쇄(PDF 저장) */
export async function printDoc(doc, entry) {
  const off = document.createElement('div');
  off.style.cssText = 'position:fixed;left:-20000px;top:0;';
  document.body.appendChild(off);
  try {
    await layout(off, { doc, geometry: entry.analysis.geometry, css: entry.analysis.css, theme: entry.meta.theme, headerTexts: headerStrings(entry, doc) });
    printPages(off, entry.analysis.geometry);
  } finally {
    setTimeout(() => off.remove(), 1500);
  }
}
