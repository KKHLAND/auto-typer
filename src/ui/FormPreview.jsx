import { useMemo } from 'react';
import { formTree, slotLayout } from '../engine/form.js';
import { inlineHtml, paragraphs } from '../engine/markup.js';

/** 채움 양식 미리보기: 학생마다 양식 한 부, 채운 값은 파란 글씨(누르면 고치기) */
export default function FormPreview({ doc, entry, onPick, print = false }) {
  const form = entry.form;
  const tree = useMemo(() => formTree(form.pkg), [form]);
  const layout = useMemo(() => slotLayout(form.pkg, form.slots), [form]);
  const recs = useMemo(() => {
    const m = new Map();
    for (const b of doc.blocks || []) {
      if (!m.has(b.rec ?? 0)) m.set(b.rec ?? 0, new Map());
      if (b.slot) m.get(b.rec ?? 0).set(b.slot, b);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [doc]);

  const value = (b, inline = false) =>
    b?.text?.trim() ? (
      <span className="val" data-id={b.id} onClick={() => onPick?.(b.id)}>
        {paragraphs(b.text).map((l, k) =>
          inline ? (
            <span key={k} dangerouslySetInnerHTML={{ __html: inlineHtml(l) + ' ' }} />
          ) : (
            <p key={k} dangerouslySetInnerHTML={{ __html: inlineHtml(l) || '&nbsp;' }} />
          ),
        )}
      </span>
    ) : b ? (
      <span className="val empty-val" data-id={b.id} onClick={() => onPick?.(b.id)}>(비어 있음 — 눌러서 쓰기)</span>
    ) : null;

  const renderParas = (nodes, vals) =>
    nodes.map((n) => {
      const s = layout.first.get(n.i);
      if (s) {
        const b = vals.get(s.id);
        const shown = b?.text?.trim() ? paragraphs(b.text).length : 0;
        const rest = s.kind === 'lines' ? Math.max(0, s.paras.length - Math.max(1, shown)) : 0;
        return (
          <div key={n.i}>
            {b && !s.off ? value(b) : <p className={n.under ? 'u' : ''}>{' '}</p>}
            {Array.from({ length: rest }, (_, k) => (
              <p key={k} className={n.under ? 'u' : ''}>{' '}</p>
            ))}
          </div>
        );
      }
      if (layout.covered.has(n.i)) return null;
      const fs = layout.fields.get(n.i);
      const style = { fontWeight: n.bold ? 700 : 400, fontSize: n.size > 11 ? `${n.size * 1.4}px` : undefined };
      return (
        <div key={n.i}>
          {(n.text || fs || !n.table) && (
            <p className={`${n.center ? 'c' : ''} ${n.under && !n.text.trim() ? 'u' : ''}`} style={style}>
              {fs ? n.text.replace(/\{\{[^}]*\}\}/g, '') : n.text || ' '}
              {fs?.map((f) => <span key={f.id}> {value(vals.get(f.id), true) ?? ''}</span>)}
            </p>
          )}
          {n.table && renderTable(n.table, vals)}
        </div>
      );
    });

  const renderTable = (t, vals) => {
    const scale = 660 / Math.max(1, t.width);
    const rows = Array.from({ length: t.rows }, (_, r) => t.cells.filter((c) => c.row === r).sort((a, b) => a.col - b.col));
    return (
      <table style={{ width: Math.min(660, t.width * scale) }}>
        <tbody>
          {rows.map((cs, r) => (
            <tr key={r}>
              {cs.map((c) => (
                <td key={c.col} colSpan={c.colSpan} rowSpan={c.rowSpan} style={{ width: c.w * scale }}>
                  {renderParas(c.paras, vals)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div className={print ? 'form-print' : ''}>
      {recs.map(([r, vals]) => (
        <div className="form-paper" key={r}>
          <div className="rec-h">학생 {r + 1}</div>
          {renderParas(tree, vals)}
        </div>
      ))}
    </div>
  );
}
