import { useEffect, useRef, useState } from 'react';
import * as Ic from './icons.jsx';
import { convert, fileKind } from '../services/convert.js';
import { listTemplates } from '../services/templates.js';

const KIND_LABEL = { pdf: 'PDF', image: '이미지', hwpx: 'HWPX', json: 'JSON', text: 'TXT', hwp: 'HWP', unknown: '?' };

export default function NewJob({ settings, onCancel, onDone, onSettings, notify }) {
  const [tab, setTab] = useState('file');
  const [files, setFiles] = useState([]);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('wonmook');
  const [engine, setEngine] = useState(settings.engine || 'auto');
  const [handwriting, setHandwriting] = useState(settings.handwriting || 'ignore');
  const [drag, setDrag] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState([]);
  const abort = useRef(null);
  const input = useRef(null);

  useEffect(() => {
    listTemplates().then(setTemplates);
  }, []);

  const addFiles = (list) => {
    const arr = [...list];
    setFiles((f) => [...f, ...arr]);
    if (!title && arr[0]) setTitle(arr[0].name.replace(/\.[^.]+$/, ''));
  };

  const needsAi = files.some((f) => ['image'].includes(fileKind(f.name)));
  const hasPdf = files.some((f) => fileKind(f.name) === 'pdf');
  const canStart = (files.length || text.trim()) && !running;

  const start = async () => {
    setRunning(true);
    setLog([]);
    abort.current = new AbortController();
    try {
      const res = await convert({
        files: tab === 'file' ? files : [],
        text: tab === 'paste' ? text : '',
        title: title || '새 학습자료',
        settings: { ...settings, engine, handwriting },
        signal: abort.current.signal,
        onProgress: (ev) =>
          setLog((l) => {
            const key = `${ev.stage}-${ev.page ?? ''}`;
            const next = l.filter((x) => x.key !== key);
            return [...next, { key, ...ev }].slice(-200);
          }),
      });
      const q = res.doc.items.filter((x) => x.kind === 'question').length;
      if (!res.doc.items.length) {
        notify('문항을 하나도 찾지 못했습니다. 다른 인식 방식을 골라 보세요.', 'err');
        setRunning(false);
        return;
      }
      notify(`문항 ${q}개를 찾았습니다. 하나씩 검토해 주세요.`);
      await onDone({ doc: res.doc, pages: res.pages, templateId, sourceName: files.map((f) => f.name).join(', ') || '붙여넣기', engineUsed: res.engineUsed });
    } catch (e) {
      if (e.name !== 'AbortError') notify(e.message || String(e), 'err');
      setRunning(false);
    }
  };

  return (
    <div className="content">
      <div className="crumb">
        <button onClick={onCancel}>내 스페이스</button> › 새 변환
      </div>
      <div className="page-title">
        <span className="sq" style={{ background: '#1f6fff' }} />
        <h1>새 변환</h1>
      </div>

      <div className="new-grid">
        <div className="card">
          <div className="tabs" style={{ padding: '0 12px', margin: 0 }}>
            <button className={`tab ${tab === 'file' ? 'on' : ''}`} onClick={() => setTab('file')}>
              <Ic.Upload size={15} /> 파일 올리기
            </button>
            <button className={`tab ${tab === 'paste' ? 'on' : ''}`} onClick={() => setTab('paste')}>
              <Ic.Copy size={15} /> 붙여 넣기
            </button>
          </div>
          <div className="card-b">
            {tab === 'file' ? (
              <>
                <div
                  className={`empty ${drag ? 'drag' : ''}`}
                  style={{ padding: '34px 16px' }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDrag(true);
                  }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDrag(false);
                    addFiles(e.dataTransfer.files);
                  }}
                >
                  <Ic.Upload size={30} />
                  <h2 style={{ fontSize: 16 }}>파일을 끌어다 놓거나 골라 주세요</h2>
                  <p>PDF(스캔본·손글씨 포함) · HWPX · TXT · MD · JSON · 사진(JPG·PNG)</p>
                  <button className="btn primary" onClick={() => input.current.click()}>파일 고르기</button>
                  <input
                    ref={input}
                    type="file"
                    multiple
                    hidden
                    accept=".pdf,.hwpx,.txt,.md,.markdown,.json,.png,.jpg,.jpeg,.webp,image/*"
                    onChange={(e) => {
                      addFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </div>
                {!!files.length && (
                  <div className="filelist">
                    {files.map((f, i) => (
                      <div className="file" key={i}>
                        <span className="ext">{KIND_LABEL[fileKind(f.name)]}</span>
                        <span className="grow">{f.name}</span>
                        <span className="muted" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{(f.size / 1024).toFixed(0)} KB</span>
                        <button className="icon-btn" onClick={() => setFiles(files.filter((_, k) => k !== i))} title="빼기">
                          <Ic.Close size={14} />
                        </button>
                      </div>
                    ))}
                    <div className="hint">여러 파일은 올린 순서대로 이어 붙여 한 학습자료로 만듭니다. 예전 .hwp 는 한글에서 hwpx 로 저장한 뒤 올려 주세요.</div>
                  </div>
                )}
              </>
            ) : (
              <>
                <textarea
                  className="textarea paste"
                  placeholder={'학습자료 내용을 붙여 넣으세요.\n\n[1~2] 다음 글을 읽고 물음에 답하시오.\n1. 윗글의 내용과 일치하는 것은? [3점]\n① …\n② …'}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <div className="hint">
                  밑줄은 <code>__밑줄__</code>, 굵게는 <code>**굵게**</code>, 수식은 <code>$x^{'{2}'}$</code>, 빈칸은 <code>[빈칸]</code> 으로 적으면 그대로 살아납니다.
                  한글·워드에서 복사한 글이라 줄이 엉켜 있으면 인식 방식을 ‘AI 정밀’로 고르세요.
                </div>
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-h">변환 설정</div>
          <div className="card-b">
            <div className="field">
              <label>학습자료 이름</label>
              <input className="input" value={title} placeholder="예) 2026 2학기 중간고사 영어Ⅱ" onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="field">
              <span className="lab">만들 양식</span>
              <div className="tpl-pick">
                {templates.map((t) => (
                  <button key={t.id} className={`tpl-opt ${templateId === t.id ? 'on' : ''}`} onClick={() => setTemplateId(t.id)}>
                    <span className="thumb"><TplThumb theme={t.theme} color={t.color} /></span>
                    <b>{t.name}</b>
                    <span>{t.desc}</span>
                  </button>
                ))}
              </div>
              <div className="hint">양식은 나중에도 바꿀 수 있습니다. 우리 학교 양식은 [양식] 메뉴에서 hwpx 로 올리세요.</div>
            </div>
            <div className="field">
              <span className="lab">인식 방식</span>
              <div className="seg">
                {[
                  ['auto', '자동'],
                  ['ai', 'AI 정밀'],
                  ['rules', '빠른 규칙'],
                ].map(([k, l]) => (
                  <button key={k} className={engine === k ? 'on' : ''} onClick={() => setEngine(k)}>{l}</button>
                ))}
              </div>
              <div className="hint">
                {engine === 'auto' && '글자가 들어 있는 파일은 규칙으로 빠르게, 스캔본·사진·손글씨는 AI 로 읽습니다. (키가 있으면 PDF 도 AI 로 — 밑줄·상자까지 더 정확)'}
                {engine === 'ai' && '모든 입력을 AI(Gemini)가 쪽마다 눈으로 읽듯 인식합니다. 밑줄·<보기> 상자·수식·그림까지 가장 정확합니다.'}
                {engine === 'rules' && 'AI 없이 문항 번호·①~⑤·[1~3] 같은 표지로만 나눕니다. 키가 없어도 되고 아주 빠르지만, PDF 의 밑줄은 잃습니다.'}
              </div>
            </div>
            {(hasPdf || needsAi || engine === 'ai') && (
              <div className="field">
                <span className="lab">필기·손글씨</span>
                <div className="seg">
                  <button className={handwriting === 'ignore' ? 'on' : ''} onClick={() => setHandwriting('ignore')}>필기는 지우고 인쇄 내용만</button>
                  <button className={handwriting === 'include' ? 'on' : ''} onClick={() => setHandwriting('include')}>손글씨 원안도 타이핑</button>
                </div>
                <div className="hint">
                  {handwriting === 'ignore'
                    ? '풀이 흔적·체크·동그라미가 있는 학습자료도 인쇄된 내용만 깔끔하게 옮깁니다.'
                    : '손으로 쓴 시험 원안을 타이핑합니다. 흐린 글자는 [?] 와 ‘확인 필요’로 표시해 드립니다.'}
                </div>
              </div>
            )}
            {!settings.apiKey && (engine === 'ai' || needsAi) && (
              <div className="notice-box" style={{ marginBottom: 12 }}>
                AI 인식에는 선생님 본인의 <b>무료 Gemini API 키</b>가 필요합니다. 1분이면 받을 수 있어요.{' '}
                <button className="btn sm" onClick={onSettings}><Ic.Key size={13} /> 키 넣으러 가기</button>
              </div>
            )}
            <button className="btn primary" style={{ width: '100%', height: 40, justifyContent: 'center' }} disabled={!canStart} onClick={start}>
              {running ? <><span className="spin" style={{ borderColor: 'rgba(255,255,255,.4)', borderTopColor: '#fff' }} /> 변환 중…</> : <><Ic.Sparkle size={16} /> 변환 시작</>}
            </button>
            {running && (
              <button className="btn ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 6 }} onClick={() => abort.current?.abort()}>
                취소
              </button>
            )}
            {!!log.length && (
              <div className="run-log">
                {log.map((l) => (
                  <div className="ln" key={l.key}>
                    <span className={`chip ${l.status === 'done' || l.stage === 'done' ? 'green' : l.status === 'waiting' ? 'amber' : 'blue'}`}>
                      {l.stage === 'render' ? '읽기' : l.stage === 'ai' ? 'AI' : '완료'}
                    </span>
                    {l.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 양식 썸네일 (작은 지면 도식) */
export function TplThumb({ theme, color = '#1f6fff', big }) {
  const w = big ? 96 : 46;
  const h = Math.round(w * 1.38);
  return (
    <svg width={w} height={h} viewBox="0 0 46 64" aria-hidden="true">
      <rect x="0.5" y="0.5" width="45" height="63" rx="1.5" fill="#fff" stroke="#d5dae2" />
      {theme === 'wonmook' && (
        <>
          <rect x="4" y="4" width="38" height="8" fill="none" stroke="#111" strokeWidth=".7" />
          <path d="M13 4v8M22 4v8M33 4v8" stroke="#111" strokeWidth=".5" />
        </>
      )}
      {theme === 'suneung' && (
        <>
          <rect x="15" y="3" width="16" height="2" fill="#666" />
          <rect x="15" y="7" width="16" height="4" fill="#111" />
          <ellipse cx="8" cy="9" rx="4" ry="2" fill="none" stroke="#111" strokeWidth=".6" />
          <path d="M4 13h38" stroke="#111" strokeWidth="1" />
        </>
      )}
      {theme === 'generic' && <rect x="10" y="4" width="26" height="5" rx="1" fill={color} opacity=".8" />}
      <path d="M23 15v45" stroke="#999" strokeWidth=".4" />
      {[17, 21, 25, 29, 33, 37, 41, 45, 49, 53].map((y) => (
        <g key={y}>
          <rect x="4" y={y} width={y % 8 === 1 ? 10 : 17} height="1.4" fill="#c3c9d3" />
          <rect x="25" y={y} width={y % 8 === 5 ? 9 : 17} height="1.4" fill="#c3c9d3" />
        </g>
      ))}
    </svg>
  );
}
