import { useRef } from 'react';
import * as Ic from './icons.jsx';
import { CHOICE_MARKS } from '../model.js';
import { inlineHtml, paragraphs } from '../engine/markup.js';

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
  return (
    <div className="mk-bar">
      <button title="밑줄 (__ __)" onMouseDown={(e) => e.preventDefault()} onClick={() => wrap('__')}><u>가</u></button>
      <button title="굵게 (** **)" onMouseDown={(e) => e.preventDefault()} onClick={() => wrap('**')}><b>가</b></button>
      <button title="수식 ($ $) — 한글 수식 문법" onMouseDown={(e) => e.preventDefault()} onClick={() => wrap('$', '$', 'x^{2}')}>∑</button>
      <button title="빈칸" onMouseDown={(e) => e.preventDefault()} onClick={() => wrap('[빈칸]', '', '')}>[　]</button>
      {['㉠', 'ⓐ', '①', '[A]'].map((s) => (
        <button key={s} onMouseDown={(e) => e.preventDefault()} onClick={() => wrap(s, '', '')}>{s}</button>
      ))}
    </div>
  );
}

const auto = (n) => ({ rows: Math.max(2, Math.min(14, n)) });

export default function ItemEditor({ item, label, pageImage, onChange, onClose, onDelete, onMove }) {
  const { bind, wrap } = useMarkup();
  if (!item) return null;
  const set = (patch) => onChange({ ...item, ...patch });
  const T = (key, rowsHint) => {
    const v = item[key] ?? '';
    return (
      <textarea
        className="textarea"
        value={v}
        {...auto(rowsHint ?? paragraphs(v).length + Math.ceil(v.length / 70))}
        {...bind(() => item[key] ?? '', (nv) => set({ [key]: nv }))}
        onChange={(e) => set({ [key]: e.target.value })}
      />
    );
  };

  const kindName = item.kind === 'question' ? (item.answerType === 'choice' ? '선택형 문항' : '서답형 문항') : item.kind === 'group' ? '묶음 지문' : '구역 제목';

  return (
    <aside className="panel">
      <div className="panel-h">
        <span className="chip blue">{kindName}</span>
        <div className="grow" />
        <button className="icon-btn" title="위로" onClick={() => onMove(-1)}><Ic.Up size={16} /></button>
        <button className="icon-btn" title="아래로" onClick={() => onMove(1)}><Ic.Down size={16} /></button>
        <button className="icon-btn" title="삭제" onClick={onDelete}><Ic.Trash size={16} /></button>
        <button className="icon-btn" title="닫기" onClick={onClose}><Ic.Close size={16} /></button>
      </div>
      <div className="panel-b">
        <div className="panel-title">
          {label ? `${label} ` : ''}
          {(item.stem || item.instruction || item.text || '(내용 없음)').replace(/[_*$]/g, '').slice(0, 60)}
        </div>

        <div className="props">
          <div className="prop">
            <span className="k">검토 상태</span>
            <div className="row-inline">
              {FLAGS.map(([k, l, c]) => (
                <button key={k} className={`chip ${item.flag === k ? (c === 'blue' ? 'solid-blue' : c) : 'gray'}`} style={{ border: 0, opacity: item.flag === k ? 1 : 0.6 }} onClick={() => set({ flag: k })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          {item.kind === 'question' && (
            <>
              <div className="prop">
                <span className="k">문항 유형</span>
                <select
                  className="select"
                  value={item.answerType}
                  onChange={(e) => {
                    const t = e.target.value;
                    set({ answerType: t, choices: t === 'choice' ? (item.choices?.length ? item.choices : ['', '', '', '', '']) : item.choices });
                  }}
                >
                  <option value="choice">선택형 (오지선다)</option>
                  <option value="short">서답형 · 단답</option>
                  <option value="essay">서답형 · 서술/논술</option>
                </select>
              </div>
              <div className="prop">
                <span className="k">배점</span>
                <input className="input" value={item.points} placeholder="예) 3.5" onChange={(e) => set({ points: e.target.value })} />
              </div>
              <div className="prop">
                <span className="k">정답</span>
                <input className="input" value={item.answer} placeholder="예) ③ (학습자료에는 찍히지 않아요)" onChange={(e) => set({ answer: e.target.value })} />
              </div>
            </>
          )}
          {item.page != null && (
            <div className="prop">
              <span className="k">원본</span>
              <span>{item.page + 1}쪽</span>
            </div>
          )}
        </div>

        <MarkBar wrap={wrap} />

        {item.kind === 'text' && (
          <>
            <div className="sec-label">구역 제목</div>
            {T('text', 1)}
          </>
        )}

        {item.kind === 'group' && (
          <>
            <div className="sec-label">지시문</div>
            {T('instruction', 1)}
            <div className="sec-label">공통 지문 <span className="grow" /><span style={{ fontSize: 11 }}>줄바꿈 = 문단</span></div>
            {T('passage')}
          </>
        )}

        {item.kind === 'question' && (
          <>
            <div className="sec-label">발문</div>
            {T('stem', 2)}
            <div className="sec-label">지문 <span className="grow" /><span style={{ fontSize: 11 }}>줄바꿈 = 문단 · 묶음 지문은 위 항목에</span></div>
            {T('passage', item.passage ? undefined : 2)}
            <div className="sec-label">
              &lt;보기&gt; 상자
              <span className="grow" />
              {item.box ? (
                <button className="btn sm ghost" onClick={() => set({ box: null })}>빼기</button>
              ) : (
                <button className="btn sm" onClick={() => set({ box: { title: '< 보 기 >', text: '' } })}>+ 상자</button>
              )}
            </div>
            {item.box && (
              <>
                <input className="input" style={{ marginBottom: 6 }} value={item.box.title} placeholder="상자 제목 (비우면 제목 없음)" onChange={(e) => set({ box: { ...item.box, title: e.target.value } })} />
                <textarea
                  className="textarea"
                  {...auto(paragraphs(item.box.text).length + 1)}
                  value={item.box.text}
                  {...bind(() => item.box.text, (nv) => set({ box: { ...item.box, text: nv } }))}
                  onChange={(e) => set({ box: { ...item.box, text: e.target.value } })}
                />
              </>
            )}
            {item.answerType === 'choice' && (
              <>
                <div className="sec-label">
                  선택지
                  <span className="grow" />
                  {(item.choices?.length ?? 0) < 7 && <button className="btn sm ghost" onClick={() => set({ choices: [...item.choices, ''] })}>+ 선지</button>}
                  {(item.choices?.length ?? 0) > 2 && <button className="btn sm ghost" onClick={() => set({ choices: item.choices.slice(0, -1) })}>− 선지</button>}
                </div>
                {item.choices.map((c, i) => (
                  <div key={i} className={`choice-row ${item.answer && item.answer.includes(CHOICE_MARKS[i]) ? 'answer' : ''}`}>
                    <span className="cm" title="눌러서 정답으로" style={{ cursor: 'pointer' }} onClick={() => set({ answer: CHOICE_MARKS[i] })}>{CHOICE_MARKS[i]}</span>
                    <textarea
                      className="textarea"
                      rows={1}
                      value={c}
                      placeholder={i === 0 && !c ? '비워 두면 지문 속 번호를 고르는 문항(①~⑤만 표시)' : ''}
                      {...bind(() => item.choices[i], (nv) => set({ choices: item.choices.map((x, k) => (k === i ? nv : x)) }))}
                      onChange={(e) => set({ choices: item.choices.map((x, k) => (k === i ? e.target.value : x)) })}
                    />
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {(item.kind === 'question' || item.kind === 'group') && (
          <>
            <div className="sec-label">그림</div>
            <div className="fig-box">
              {item.figure?.src ? <img src={item.figure.src} alt="" /> : <Ic.Image size={26} />}
              <div className="row-inline">
                <label className="btn sm">
                  {item.figure ? '바꾸기' : '그림 넣기'}
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
                {item.figure && <button className="btn sm ghost" onClick={() => set({ figure: null })}>빼기</button>}
              </div>
            </div>
          </>
        )}

        <div className="sec-label">미리보기</div>
        <div className="mini-preview">
          {item.kind === 'question' && (
            <>
              <div><b>{label}</b> <span dangerouslySetInnerHTML={{ __html: inlineHtml(item.stem || '') }} />{item.points ? ` [${item.points}점]` : ''}</div>
              {paragraphs(item.passage).filter(Boolean).map((p, i) => <p key={i} style={{ margin: '4px 0', textIndent: '1em' }} dangerouslySetInnerHTML={{ __html: inlineHtml(p) }} />)}
              {item.box && <div style={{ border: '1px solid #000', padding: '6px 8px', margin: '6px 0' }}><div style={{ textAlign: 'center' }}>{item.box.title}</div>{paragraphs(item.box.text).map((p, i) => <div key={i} dangerouslySetInnerHTML={{ __html: inlineHtml(p) }} />)}</div>}
              {item.answerType === 'choice' && item.choices.some(Boolean) && item.choices.map((c, i) => <div key={i} dangerouslySetInnerHTML={{ __html: `${CHOICE_MARKS[i]} ${inlineHtml(c)}` }} />)}
            </>
          )}
          {item.kind === 'group' && (
            <>
              <div style={{ fontWeight: 600 }} dangerouslySetInnerHTML={{ __html: inlineHtml(item.instruction || '') }} />
              {paragraphs(item.passage).filter(Boolean).map((p, i) => <p key={i} style={{ margin: '4px 0', textIndent: '1em' }} dangerouslySetInnerHTML={{ __html: inlineHtml(p) }} />)}
            </>
          )}
          {item.kind === 'text' && <b dangerouslySetInnerHTML={{ __html: inlineHtml(item.text) }} />}
        </div>

        {pageImage && (
          <>
            <div className="sec-label">원본 {item.page + 1}쪽</div>
            <img src={pageImage} alt="" style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 6 }} />
          </>
        )}
      </div>
    </aside>
  );
}
