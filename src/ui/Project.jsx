import { useEffect, useRef, useState } from 'react';
import * as Ic from './icons.jsx';
import BlockEditor from './ItemEditor.jsx';
import Preview, { printDoc, headerStrings, effectiveEdits } from './Preview.jsx';
import { reviewStats, StatusChip } from './Home.jsx';
import { listTemplates, loadTemplate } from '../services/templates.js';
import { buildHwpx } from '../engine/hwpx.js';
import { plain } from '../engine/markup.js';
import { blockSummary, newBlock, TYPE_LABEL } from '../model.js';

const FLAG = { todo: ['검토 전', 'gray'], check: ['확인 필요', 'amber'], done: ['검토 완료', 'blue'] };

export function typeChip(b) {
  const label = b.type === 'heading' ? `소제목 ${b.level || 1}` : b.type === 'list' && (b.level || 1) > 1 ? `목록 ${b.level}` : TYPE_LABEL[b.type] || '문단';
  const tone = b.type === 'title' || b.type === 'heading' ? 'blue' : b.type === 'box' || b.type === 'table' || b.type === 'figure' ? 'green' : 'gray';
  return <span className={`chip ${tone}`}>{label}</span>;
}

export default function Project({ record, pages, onSave, onBack, notify }) {
  const [rec, setRec] = useState(record);
  const [tab, setTab] = useState('list');
  const [sel, setSel] = useState(null);
  const [filter, setFilter] = useState('all');
  const [templates, setTemplates] = useState([]);
  const [entry, setEntry] = useState(null);
  const [zoom, setZoom] = useState(0.75);
  const [headerOpen, setHeaderOpen] = useState(false);
  const [pageCount, setPageCount] = useState(null);
  const saveT = useRef(null);
  const doc = rec.doc;
  const blocks = doc.blocks || [];

  useEffect(() => {
    listTemplates().then(setTemplates);
  }, []);
  useEffect(() => {
    loadTemplate(rec.templateId).then(setEntry).catch((e) => notify(e.message, 'err'));
  }, [rec.templateId, notify]);

  // 변경 → 0.5초 뒤 자동 저장
  const update = (nextDoc, extra = {}) => {
    const next = { ...rec, ...extra, doc: nextDoc };
    setRec(next);
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => onSave(next), 500);
  };
  useEffect(() => () => clearTimeout(saveT.current), []);

  const setBlocks = (bs) => update({ ...doc, blocks: bs });
  const stats = reviewStats(doc);
  const shown = blocks.filter((b) => filter === 'all' || (b.flag ?? 'todo') === filter);
  const selBlock = blocks.find((x) => x.id === sel);

  const setBlock = (b) => setBlocks(blocks.map((x) => (x.id === b.id ? b : x)));
  const addBlock = (b) => {
    const idx = sel ? blocks.findIndex((x) => x.id === sel) + 1 : blocks.length;
    const arr = [...blocks];
    arr.splice(idx, 0, b);
    setBlocks(arr);
    setSel(b.id);
  };
  const removeBlock = (id) => {
    setBlocks(blocks.filter((x) => x.id !== id));
    setSel(null);
  };
  const moveBlock = (id, d) => {
    const arr = [...blocks];
    const i = arr.findIndex((x) => x.id === id);
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setBlocks(arr);
  };

  const fileName = (ext) => `${(doc.title || '학습자료').replace(/[\\/:*?"<>|]/g, '_')}.${ext}`;

  const downloadHwpx = async () => {
    try {
      const e = entry ?? (await loadTemplate(rec.templateId));
      const bytes = buildHwpx(e.pkg, doc, { analysis: e.analysis, headerEdits: effectiveEdits(e, doc) });
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/hwp+zip' }));
      Object.assign(document.createElement('a'), { href: url, download: fileName('hwpx') }).click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      notify('hwpx 를 내려받았습니다. 한글에서 열어 확인해 주세요.');
    } catch (err) {
      notify(`hwpx 만들기 실패: ${err.message}`, 'err');
    }
  };

  const savePdf = async () => {
    if (!entry) return;
    notify('인쇄 창에서 ‘PDF로 저장’을 고르세요.');
    await printDoc(doc, entry);
  };

  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: fileName('json') }).click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const summary = (b) => plain(blockSummary(b)) || '(내용 없음)';
  const tpl = templates.find((t) => t.id === rec.templateId);
  const count = (f) => blocks.filter((x) => (x.flag ?? 'todo') === f).length;

  return (
    <>
      <div className="content">
        <div className="crumb">
          <button onClick={onBack}>내 스페이스</button> › <span>{rec.sourceName || '학습자료'}</span>
        </div>
        <div className="page-title">
          <span className="sq" style={{ background: rec.color }} />
          <input className="title-input" aria-label="학습자료 이름" value={doc.title} onChange={(e) => update({ ...doc, title: e.target.value })} size={Math.max(8, doc.title.length + 2)} />
          <StatusChip stats={stats} />
          <div className="acts">
            <select className="select" style={{ width: 250, height: 38 }} value={rec.templateId} onChange={(e) => update({ ...doc, templateId: e.target.value }, { templateId: e.target.value })} aria-label="양식">
              {templates.map((t) => (
                <option key={t.id} value={t.id}>양식: {t.name}</option>
              ))}
            </select>
            <button className="btn" onClick={() => setHeaderOpen(true)} disabled={!entry}>머리글 편집</button>
            <button className="btn" onClick={savePdf} disabled={!entry}><Ic.Printer size={15} /> PDF</button>
            <button className="btn primary" onClick={downloadHwpx} disabled={!entry}><Ic.Download size={15} /> HWPX 내려받기</button>
          </div>
        </div>

        <div className="tabs">
          <button className={`tab ${tab === 'list' ? 'on' : ''}`} onClick={() => setTab('list')}><Ic.List size={15} /> 내용 <span className="count">{blocks.length}</span></button>
          <button className={`tab ${tab === 'board' ? 'on' : ''}`} onClick={() => setTab('board')}><Ic.Board size={15} /> 검토 보드</button>
          {!!pages.length && <button className={`tab ${tab === 'source' ? 'on' : ''}`} onClick={() => setTab('source')}><Ic.Columns size={15} /> 원본 대조</button>}
          <button className={`tab ${tab === 'preview' ? 'on' : ''}`} onClick={() => setTab('preview')}><Ic.Eye size={15} /> 미리보기 {pageCount ? <span className="count">{pageCount}면</span> : null}</button>
        </div>

        {(tab === 'list' || tab === 'board') && (
          <div className="toolbar">
            {tab === 'list' &&
              [
                ['all', `전체 ${blocks.length}`],
                ['check', `확인 필요 ${count('check')}`],
                ['todo', `검토 전 ${count('todo')}`],
                ['done', `검토 완료 ${count('done')}`],
              ].map(([k, l]) => (
                <button key={k} className={`pill-btn ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
              ))}
            {tab === 'list' && <span className="sep" />}
            <button className="pill-btn" onClick={() => addBlock(newBlock('heading', { level: 1, text: '소제목' }))}><Ic.Plus size={13} /> 소제목</button>
            <button className="pill-btn" onClick={() => addBlock(newBlock('paragraph'))}><Ic.Plus size={13} /> 문단</button>
            <button className="pill-btn" onClick={() => addBlock(newBlock('list', { text: '• ' }))}><Ic.Plus size={13} /> 목록</button>
            <button className="pill-btn" onClick={() => addBlock(newBlock('box', { title: '' }))}><Ic.Plus size={13} /> 상자</button>
            <button className="pill-btn" onClick={() => addBlock(newBlock('table'))}><Ic.Plus size={13} /> 표</button>
            <span className="sep" />
            <button className="pill-btn" onClick={() => setBlocks(blocks.map((x) => ({ ...x, flag: 'done' })))}><Ic.Check size={13} /> 모두 검토 완료</button>
            <button className="pill-btn" onClick={exportJson}><Ic.Doc size={13} /> JSON</button>
            <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--ink-3)' }}>
              {rec.engineUsed === 'ai' ? 'AI 인식' : rec.engineUsed === 'kordoc' ? '문서 변환(kordoc)' : '규칙 인식'} · 자동 저장
            </span>
          </div>
        )}

        {tab === 'list' && (
          <table className="table">
            <thead>
              <tr>
                <th>종류</th>
                <th>내용 (읽은 그대로)</th>
                <th>원본</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((b) => (
                <tr key={b.id} className={`row ${sel === b.id ? 'sel' : ''}`} onClick={() => setSel(b.id)}>
                  <td style={{ width: 110 }}>{typeChip(b)}</td>
                  <td>
                    <span
                      className="ellipsis"
                      style={{
                        fontWeight: b.type === 'title' || b.type === 'heading' ? 700 : 400,
                        paddingLeft: b.type === 'list' ? ((b.level || 1) - 1) * 18 : 0,
                        maxWidth: 760,
                      }}
                    >
                      {summary(b)}
                    </span>
                  </td>
                  <td className="num muted">{b.page != null ? `${b.page + 1}쪽` : ''}</td>
                  <td style={{ width: 110 }}><span className={`chip ${FLAG[b.flag ?? 'todo'][1]}`}><span className="dot" />{FLAG[b.flag ?? 'todo'][0]}</span></td>
                </tr>
              ))}
              {!shown.length && (
                <tr><td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 30 }}>해당하는 내용이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        )}

        {tab === 'board' && (
          <div className="board">
            {['check', 'todo', 'done'].map((f) => {
              const col = blocks.filter((x) => (x.flag ?? 'todo') === f);
              return (
                <div
                  key={f}
                  className="col"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const id = e.dataTransfer.getData('text/plain');
                    const b = blocks.find((x) => x.id === id);
                    if (b) setBlock({ ...b, flag: f });
                  }}
                >
                  <div className="col-h"><span className={`chip ${FLAG[f][1]}`}>{FLAG[f][0]}</span> {col.length}</div>
                  {col.map((b) => (
                    <div key={b.id} className={`kcard ${sel === b.id ? 'sel' : ''}`} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', b.id)} onClick={() => setSel(b.id)}>
                      <div className="t">{summary(b)}</div>
                      <div className="m">
                        {typeChip(b)}
                        {b.page != null && <span>원본 {b.page + 1}쪽</span>}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'source' && (
          <div className="source-view">
            <div className="source-pages">
              {pages.map((p, i) => (
                <div className="pg" key={i}>
                  <span className="chip gray">원본 {i + 1}쪽</span>
                  <img src={p.dataUrl} alt={`원본 ${i + 1}쪽`} />
                </div>
              ))}
            </div>
            <div>{entry && <Preview doc={doc} entry={entry} zoom={0.55} onPages={setPageCount} onPick={setSel} />}</div>
          </div>
        )}

        {tab === 'preview' && (
          <>
            <div className="toolbar">
              <span style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{tpl?.name}</span>
              <span className="sep" />
              {[0.5, 0.75, 1].map((z) => (
                <button key={z} className={`pill-btn ${zoom === z ? 'on' : ''}`} onClick={() => setZoom(z)}>{Math.round(z * 100)}%</button>
              ))}
              <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--ink-3)' }}>지면을 누르면 해당 내용을 고칠 수 있어요 · PDF 는 이 모양 그대로 저장됩니다</span>
            </div>
            {entry ? <Preview doc={doc} entry={entry} zoom={zoom} onPages={setPageCount} onPick={setSel} /> : <div className="loading"><span className="spin" /></div>}
          </>
        )}
      </div>

      {selBlock && (
        <BlockEditor
          block={selBlock}
          pageImage={selBlock.page != null ? pages[selBlock.page]?.dataUrl : null}
          onChange={setBlock}
          onClose={() => setSel(null)}
          onDelete={() => confirm('이 내용을 지울까요?') && removeBlock(selBlock.id)}
          onMove={(d) => moveBlock(selBlock.id, d)}
        />
      )}

      {headerOpen && entry && (
        <HeaderModal
          entry={entry}
          doc={doc}
          onClose={() => setHeaderOpen(false)}
          onSave={(edits) => {
            update({ ...doc, headerEdits: { ...(doc.headerEdits || {}), [entry.meta.id]: edits } });
            setHeaderOpen(false);
          }}
        />
      )}
    </>
  );
}

function HeaderModal({ entry, doc, onClose, onSave }) {
  const cur = headerStrings(entry, doc);
  const [vals, setVals] = useState(cur);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          머리글 · 바닥글 편집 <span className="grow" />
          <button className="icon-btn" aria-label="닫기" onClick={onClose}><Ic.Close size={16} /></button>
        </div>
        <div className="modal-b">
          <div className="hint" style={{ marginBottom: 12 }}>
            ‘{entry.meta.name}’ 양식의 머리 표·머리말·바닥글 문구입니다. 칸 모양과 글꼴은 양식 그대로 두고 글자만 바꿉니다.
          </div>
          {entry.headerTexts.map((h, i) => (
            <div className="prop" key={h.key} style={{ gridTemplateColumns: '130px 1fr', marginBottom: 6 }}>
              <span className="k">{h.label || `문구 ${i + 1}`}</span>
              <input className="input" value={vals[i]} onChange={(e) => setVals(vals.map((v, k) => (k === i ? e.target.value : v)))} />
            </div>
          ))}
        </div>
        <div className="modal-f">
          <button className="btn ghost" onClick={() => setVals(entry.headerTexts.map((h) => h.text))}>양식 기본값</button>
          <button className="btn" onClick={onClose}>취소</button>
          <button
            className="btn primary"
            onClick={() => {
              const edits = {};
              entry.headerTexts.forEach((h, i) => {
                if (vals[i] !== h.text) edits[h.key] = vals[i];
              });
              onSave(edits);
            }}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
