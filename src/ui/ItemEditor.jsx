import { useRef } from 'react';
import * as Ic from './icons.jsx';
import { TYPE_LABEL } from '../model.js';
import { clearGuesses, hasGuess, inlineHtml, paragraphs } from '../engine/markup.js';

const FLAGS = [
  ['todo', '검토 전', 'gray'],
  ['check', '확인 필요', 'amber'],
  ['done', '검토 완료', 'blue'],
];

/** 선택 영역을 표기로 감싸기 */
function useMarkup() {
  const last = useRef(null);
  const bind = (get, set) => ({
    onFocus: (e) => (last.current = { el: e.target, get, set }),
  });
  const wrap = (before, after = before, placeholder = '') => {
    const L = last.current;
    if (!L) return;
    const { el, get, set } = L;
    const v = get();
    const s = el.selectionStart ?? v.length;
    const e = el.selectionEnd ?? v.length;
    const mid = v.slice(s, e) || placeholder;
    set(v.slice(0, s) + before + mid + after + v.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + mid.length);
    });
  };
  return { bind, wrap };
}

function MarkBar({ wrap }) {
  const B = ({ title, children, onClick }) => (
    <button title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>{children}</button>
  );
  return (
    <div className="mk-bar">
      <B title="밑줄 (__ __)" onClick={() => wrap('__')}><u>가</u></B>
      <B title="굵게 (** **)" onClick={() => wrap('**')}><b>가</b></B>
      <B title="수식 ($ $) — 한글 수식 문법" onClick={() => wrap('$', '$', 'x^{2}')}>∑</B>
      <B title="빈칸" onClick={() => wrap('[빈칸]', '', '')}>[　]</B>
      {['•', '①', '㉠', '→'].map((s) => (
        <B key={s} title={`${s} 넣기`} onClick={() => wrap(s, '', '')}>{s}</B>
      ))}
    </div>
  );
}

const rowsOf = (n) => ({ rows: Math.max(2, Math.min(16, n)) });

export default function BlockEditor({ block: b, pageImage, onChange, onClose, onDelete, onMove }) {
  const { bind, wrap } = useMarkup();
  if (!b) return null;
  const set = (patch) => onChange({ ...b, ...patch });
  const textArea = (key, label) => {
    const v = b[key] ?? '';
    return (
      <>
        <label className="sec-label" htmlFor={`f-${key}`}>{label}</label>
        <textarea
          id={`f-${key}`}
          className="textarea"
          value={v}
          {...rowsOf(paragraphs(v).length + Math.ceil(v.length / 60))}
          {...bind(() => b[key] ?? '', (nv) => set({ [key]: nv }))}
          onChange={(e) => set({ [key]: e.target.value })}
        />
      </>
    );
  };

  // 종류 바꾸기: 글자는 그대로 두고 담는 그릇만 바꾼다
  const changeType = (type) => {
    const patch = { type };
    if ((type === 'heading' || type === 'list') && !b.level) patch.level = 1;
    if (type === 'box' && b.title == null) patch.title = '';
    if (type === 'table' && !b.rows) patch.rows = paragraphs(b.text).filter(Boolean).map((l) => l.split(/\s*[|\t]\s*/));
    onChange({ ...b, ...patch });
  };

  const tableText = (b.rows || []).map((r) => r.join(' | ')).join('\n');

  return (
    <aside className="panel" aria-label="내용 편집">
      <div className="panel-h">
        <span className="chip blue">{TYPE_LABEL[b.type] || '문단'}</span>
        <div className="grow" />
        <button className="icon-btn" aria-label="위로" title="위로" onClick={() => onMove(-1)}><Ic.Up size={16} /></button>
        <button className="icon-btn" aria-label="아래로" title="아래로" onClick={() => onMove(1)}><Ic.Down size={16} /></button>
        <button className="icon-btn" aria-label="삭제" title="삭제" onClick={onDelete}><Ic.Trash size={16} /></button>
        <button className="icon-btn" aria-label="닫기" title="닫기" onClick={onClose}><Ic.Close size={16} /></button>
      </div>
      <div className="panel-b">
        <div className="panel-title">{(b.text || b.title || TYPE_LABEL[b.type] || '').replace(/[_*$]/g, '').slice(0, 60) || '(내용 없음)'}</div>

        <div className="props">
          <div className="prop">
            <span className="k">검토 상태</span>
            <div className="row-inline">
              {FLAGS.map(([k, l, c]) => (
                <button key={k} className={`chip ${b.flag === k ? (c === 'blue' ? 'solid-blue' : c) : 'gray'}`} style={{ border: 0, opacity: b.flag === k ? 1 : 0.6 }} onClick={() => set({ flag: k })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="prop">
            <label className="k" htmlFor="f-type">종류</label>
            <select id="f-type" className="select" value={b.type} onChange={(e) => changeType(e.target.value)}>
              {Object.entries(TYPE_LABEL).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          </div>
          {(b.type === 'heading' || b.type === 'list') && (
            <div className="prop">
              <span className="k">{b.type === 'heading' ? '단계' : '들여쓰기'}</span>
              <div className="seg">
                {[1, 2, 3].map((n) => (
                  <button key={n} className={(b.level || 1) === n ? 'on' : ''} onClick={() => set({ level: n })}>{n}</button>
                ))}
              </div>
            </div>
          )}
          {b.page != null && (
            <div className="prop">
              <span className="k">원본</span>
              <span>{b.page + 1}쪽</span>
            </div>
          )}
        </div>

        {(hasGuess(b.text) || hasGuess(b.title) || (b.rows || []).flat().some(hasGuess)) && (
          <div className="guess-note" role="note">
            <span><mark className="guess">노란 표시</mark>는 흐린 손글씨를 AI가 맥락으로 짐작해 채운 곳입니다. 원본과 대조해 고치세요. hwpx·PDF 에는 표시 없이 글자만 들어갑니다.</span>
            <button
              className="btn sm"
              onClick={() => set({ text: clearGuesses(b.text), title: b.title == null ? b.title : clearGuesses(b.title), ...(b.rows ? { rows: b.rows.map((r) => r.map(clearGuesses)) } : {}), flag: 'done' })}
            >
              확인했어요 — 표시 지우기
            </button>
          </div>
        )}

        {b.type !== 'table' && b.type !== 'figure' && <MarkBar wrap={wrap} />}

        {b.type === 'box' && (
          <>
            <label className="sec-label" htmlFor="f-title">상자 제목 (없으면 비워 두기)</label>
            <input id="f-title" className="input" value={b.title ?? ''} placeholder="예) <보기>, 핵심 정리" {...bind(() => b.title ?? '', (nv) => set({ title: nv }))} onChange={(e) => set({ title: e.target.value })} />
          </>
        )}

        {b.type === 'table' ? (
          <>
            <label className="sec-label" htmlFor="f-rows">표 내용 <span className="grow" /><span style={{ fontSize: 11 }}>한 줄 = 한 행, 칸은 | 로 나눔 · 첫 행 = 머리 행</span></label>
            <textarea
              id="f-rows"
              className="textarea"
              style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13 }}
              {...rowsOf((b.rows || []).length + 1)}
              value={tableText}
              onChange={(e) => {
                const rows = e.target.value.split('\n').map((l) => l.split('|').map((c) => c.trim()));
                const w = Math.max(...rows.map((r) => r.length));
                rows.forEach((r) => { while (r.length < w) r.push(''); });
                set({ rows });
              }}
            />
            {textArea('text', '표 제목 (선택)')}
          </>
        ) : b.type === 'figure' ? (
          <>
            <div className="sec-label">그림</div>
            <div className="fig-box">
              {b.figure?.src ? <img src={b.figure.src} alt="" /> : <Ic.Image size={26} />}
              <label className="btn sm">
                {b.figure ? '바꾸기' : '그림 넣기'}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files[0];
                    if (!f) return;
                    const src = await new Promise((r) => {
                      const fr = new FileReader();
                      fr.onload = () => r(fr.result);
                      fr.readAsDataURL(f);
                    });
                    const im = new Image();
                    im.onload = () => set({ figure: { src, w: im.width, h: im.height } });
                    im.src = src;
                  }}
                />
              </label>
            </div>
            {textArea('text', '그림 설명 (선택)')}
          </>
        ) : (
          textArea('text', b.type === 'box' ? '상자 내용 (줄바꿈 = 문단)' : '내용 (읽은 그대로 · 줄바꿈 = 문단)')
        )}

        <div className="sec-label">미리보기</div>
        <div className="mini-preview">
          {b.type === 'table' ? (
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <tbody>
                {(b.rows || []).map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, ci) => (
                      <td key={ci} style={{ border: '1px solid #000', padding: '2px 6px', fontWeight: ri === 0 && b.rows.length > 1 ? 700 : 400 }} dangerouslySetInnerHTML={{ __html: inlineHtml(c) }} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : b.type === 'box' ? (
            <div style={{ border: '1px solid #000', padding: '6px 8px' }}>
              {b.title && <div style={{ textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: inlineHtml(b.title) }} />}
              {paragraphs(b.text).map((p, i) => <div key={i} dangerouslySetInnerHTML={{ __html: inlineHtml(p) }} />)}
            </div>
          ) : b.type === 'figure' ? (
            b.figure?.src ? <img src={b.figure.src} alt="" style={{ maxWidth: '100%' }} /> : null
          ) : (
            paragraphs(b.text).map((p, i) => (
              <div
                key={i}
                style={{
                  fontWeight: b.type === 'title' || b.type === 'heading' ? 700 : 400,
                  fontSize: b.type === 'title' ? 18 : b.type === 'heading' ? 16 - (b.level || 1) : 13,
                  textAlign: b.type === 'title' ? 'center' : 'left',
                  paddingLeft: b.type === 'list' ? ((b.level || 1) - 1) * 16 : 0,
                }}
                dangerouslySetInnerHTML={{ __html: inlineHtml(p) }}
              />
            ))
          )}
        </div>

        {pageImage && (
          <>
            <div className="sec-label">원본 {b.page + 1}쪽</div>
            <img src={pageImage} alt={`원본 ${b.page + 1}쪽`} style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 6 }} />
          </>
        )}
      </div>
    </aside>
  );
}
