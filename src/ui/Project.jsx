import { useEffect, useMemo, useRef, useState } from 'react';
import * as Ic from './icons.jsx';
import ItemEditor from './ItemEditor.jsx';
import Preview, { printDoc, headerStrings } from './Preview.jsx';
import { reviewStats, StatusChip } from './Home.jsx';
import { listTemplates, loadTemplate } from '../services/templates.js';
import { buildHwpx } from '../engine/hwpx.js';
import { plain } from '../engine/markup.js';
import { newGroup, newQuestion, newText, numberItems } from '../model.js';

const FLAG = { todo: ['검토 전', 'gray'], check: ['확인 필요', 'amber'], done: ['검토 완료', 'blue'] };

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

  const nums = useMemo(() => numberItems(doc.items), [doc.items]);
  const stats = reviewStats(doc);
  const items = doc.items.filter((it) => filter === 'all' || it.flag === filter);
  const selItem = doc.items.find((x) => x.id === sel);

  const setItem = (it) => update({ ...doc, items: doc.items.map((x) => (x.id === it.id ? it : x)) });
  const addItem = (it) => {
    const idx = sel ? doc.items.findIndex((x) => x.id === sel) + 1 : doc.items.length;
    const arr = [...doc.items];
    arr.splice(idx, 0, it);
    update({ ...doc, items: arr });
    setSel(it.id);
  };
  const removeItem = (id) => {
    update({ ...doc, items: doc.items.filter((x) => x.id !== id) });
    setSel(null);
  };
  const moveItem = (id, d) => {
    const arr = [...doc.items];
    const i = arr.findIndex((x) => x.id === id);
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    update({ ...doc, items: arr });
  };

  const fileName = (ext) => `${(doc.title || '시험지').replace(/[\\/:*?"<>|]/g, '_')}.${ext}`;

  const downloadHwpx = async () => {
    try {
      const e = entry ?? (await loadTemplate(rec.templateId));
      const bytes = buildHwpx(e.pkg, doc, { analysis: e.analysis, headerEdits: doc.headerEdits?.[e.meta.id] });
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/hwp+zip' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: fileName('hwpx') });
      a.click();
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

  const kindChip = (it) =>
    it.kind === 'group' ? <span className="chip blue">묶음 지문</span> : it.kind === 'text' ? <span className="chip gray">구역 제목</span> : it.answerType === 'choice' ? <span className="chip gray">선택형</span> : <span className="chip gray">{it.answerType === 'essay' ? '서술형' : '단답형'}</span>;
  const summary = (it) => plain(it.kind === 'question' ? it.stem || it.passage : it.kind === 'group' ? it.instruction || it.passage : it.text) || '(내용 없음)';

  const tpl = templates.find((t) => t.id === rec.templateId);

  return (
    <>
      <div className="content">
        <div className="crumb">
          <button onClick={onBack}>내 스페이스</button> › <span>{rec.sourceName || '시험지'}</span>
        </div>
        <div className="page-title">
          <span className="sq" style={{ background: rec.color }} />
          <input className="title-input" value={doc.title} onChange={(e) => update({ ...doc, title: e.target.value })} size={Math.max(8, doc.title.length + 2)} />
          <StatusChip stats={stats} />
          <div className="acts">
            <select className="select" style={{ width: 210, height: 32 }} value={rec.templateId} onChange={(e) => update({ ...doc, templateId: e.target.value }, { templateId: e.target.value })} title="양식">
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
          <button className={`tab ${tab === 'list' ? 'on' : ''}`} onClick={() => setTab('list')}><Ic.List size={15} /> 리스트 <span className="count">{doc.items.length}</span></button>
          <button className={`tab ${tab === 'board' ? 'on' : ''}`} onClick={() => setTab('board')}><Ic.Board size={15} /> 검토 보드</button>
          {!!pages.length && <button className={`tab ${tab === 'source' ? 'on' : ''}`} onClick={() => setTab('source')}><Ic.Columns size={15} /> 원본 대조</button>}
          <button className={`tab ${tab === 'preview' ? 'on' : ''}`} onClick={() => setTab('preview')}><Ic.Eye size={15} /> 미리보기 {pageCount ? <span className="count">{pageCount}면</span> : null}</button>
        </div>

        {(tab === 'list' || tab === 'board') && (
          <div className="toolbar">
            {tab === 'list' &&
              [
                ['all', `전체 ${doc.items.length}`],
                ['check', `확인 필요 ${doc.items.filter((x) => x.flag === 'check').length}`],
                ['todo', `검토 전 ${doc.items.filter((x) => x.flag === 'todo').length}`],
                ['done', `검토 완료 ${doc.items.filter((x) => x.flag === 'done').length}`],
              ].map(([k, l]) => (
                <button key={k} className={`pill-btn ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
              ))}
            {tab === 'list' && <span className="sep" />}
            <button className="pill-btn" onClick={() => addItem(newQuestion())}><Ic.Plus size={13} /> 문항</button>
            <button className="pill-btn" onClick={() => addItem(newGroup({ instruction: '[ ~ ] 다음 글을 읽고 물음에 답하시오.' }))}><Ic.Plus size={13} /> 묶음 지문</button>
            <button className="pill-btn" onClick={() => addItem(newText({ text: '서답형' }))}><Ic.Plus size={13} /> 구역 제목</button>
            <span className="sep" />
            <button className="pill-btn" onClick={() => update({ ...doc, items: doc.items.map((x) => ({ ...x, flag: 'done' })) })}><Ic.Check size={13} /> 모두 검토 완료</button>
            <button className="pill-btn" onClick={exportJson}><Ic.Doc size={13} /> JSON</button>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-3)' }}>
              {rec.engineUsed === 'ai' ? 'AI 인식' : '규칙 인식'} · 자동 저장
            </span>
          </div>
        )}

        {tab === 'list' && (
          <table className="table">
            <thead>
              <tr>
                <th>번호</th>
                <th>종류</th>
                <th>내용</th>
                <th>배점</th>
                <th>정답</th>
                <th>원본</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className={`row ${sel === it.id ? 'sel' : ''}`} onClick={() => setSel(it.id)}>
                  <td className="num">{nums.get(it.id)?.label ?? ''}</td>
                  <td style={{ width: 90 }}>{kindChip(it)}</td>
                  <td>
                    <span className="ellipsis" style={{ fontWeight: it.kind === 'question' ? 500 : 400 }}>{summary(it)}</span>
                  </td>
                  <td className="num">{it.points ? `${it.points}점` : ''}</td>
                  <td className="num">{it.answer || ''}</td>
                  <td className="num muted">{it.page != null ? `${it.page + 1}쪽` : ''}</td>
                  <td style={{ width: 96 }}><span className={`chip ${FLAG[it.flag ?? 'todo'][1]}`}><span className="dot" />{FLAG[it.flag ?? 'todo'][0]}</span></td>
                </tr>
              ))}
              {!items.length && (
                <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 30 }}>해당하는 항목이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        )}

        {tab === 'board' && (
          <div className="board">
            {['check', 'todo', 'done'].map((f) => {
              const col = doc.items.filter((x) => (x.flag ?? 'todo') === f);
              return (
                <div
                  key={f}
                  className="col"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const id = e.dataTransfer.getData('text/plain');
                    const it = doc.items.find((x) => x.id === id);
                    if (it) setItem({ ...it, flag: f });
                  }}
                >
                  <div className="col-h"><span className={`chip ${FLAG[f][1]}`}>{FLAG[f][0]}</span> {col.length}</div>
                  {col.map((it) => (
                    <div key={it.id} className={`kcard ${sel === it.id ? 'sel' : ''}`} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', it.id)} onClick={() => setSel(it.id)}>
                      <div className="t">{nums.get(it.id)?.label ?? ''} {summary(it)}</div>
                      <div className="m">
                        {kindChip(it)}
                        {it.points && <span>{it.points}점</span>}
                        {it.page != null && <span>원본 {it.page + 1}쪽</span>}
                        {it.box && <span>&lt;보기&gt;</span>}
                        {it.figure && <span>그림</span>}
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
            <div>
              {entry && <Preview doc={doc} entry={entry} zoom={0.55} onPages={setPageCount} onPick={setSel} />}
            </div>
          </div>
        )}

        {tab === 'preview' && (
          <>
            <div className="toolbar">
              <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{tpl?.name}</span>
              <span className="sep" />
              {[0.5, 0.75, 1].map((z) => (
                <button key={z} className={`pill-btn ${zoom === z ? 'on' : ''}`} onClick={() => setZoom(z)}>{Math.round(z * 100)}%</button>
              ))}
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-3)' }}>지면을 누르면 해당 문항을 고칠 수 있어요 · PDF 는 이 모양 그대로 저장됩니다</span>
            </div>
            {entry ? <Preview doc={doc} entry={entry} zoom={zoom} onPages={setPageCount} onPick={setSel} /> : <div className="loading"><span className="spin" /></div>}
          </>
        )}
      </div>

      {selItem && (
        <ItemEditor
          item={selItem}
          label={nums.get(selItem.id)?.label}
          pageImage={selItem.page != null ? pages[selItem.page]?.dataUrl : null}
          onChange={setItem}
          onClose={() => setSel(null)}
          onDelete={() => confirm('이 항목을 지울까요?') && removeItem(selItem.id)}
          onMove={(d) => moveItem(selItem.id, d)}
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
          <button className="icon-btn" onClick={onClose}><Ic.Close size={16} /></button>
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
