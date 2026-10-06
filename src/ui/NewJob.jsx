import { useEffect, useRef, useState } from 'react';
import * as Ic from './icons.jsx';
import { convert, fileKind } from '../services/convert.js';
import { listTemplates } from '../services/templates.js';

const KIND_LABEL = { pdf: 'PDF', image: '이미지', hwpx: 'HWPX', json: 'JSON', text: 'TXT', unknown: '?' };
const extLabel = (name) => {
  const ext = name.toLowerCase().split('.').pop();
  if (['md', 'markdown'].includes(ext)) return 'MD';
  const k = fileKind(name);
  return k === 'office' ? ext.toUpperCase() : KIND_LABEL[k];
};

export default function NewJob({ settings, onCancel, onDone, onSettings, notify }) {
  const [tab, setTab] = useState('file');
  const [files, setFiles] = useState([]);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('sample');
  const [engine, setEngine] = useState(settings.engine || 'auto');
  const [handwriting, setHandwriting] = useState(settings.handwriting || 'auto');
  const [mdAction, setMdAction] = useState(settings.mdAction || 'ask');
  const [drag, setDrag] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState([]);
  const [parsedResult, setParsedResult] = useState(null);
  const [downloadedMd, setDownloadedMd] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
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

  const isMathOrExamFile = files.some((f) => /수학|수능|모의|시험|기출|물리|화학|생명|지구/i.test(f.name));
  const needsAi = files.some((f) => ['image'].includes(fileKind(f.name))) || (isMathOrExamFile && engine === 'ai');
  const canStart = (files.length || text.trim()) && !running;

  const proceedCreate = async (res, tplId, srcName) => {
    const q = res.doc.blocks.length;
    if (res.engineUsed === 'kordoc') {
      notify(`kordoc 엔진으로 내용 ${q}덩이를 빠르게 파싱하고 HWPX 문서를 생성했습니다.`);
    } else if (res.engineUsed !== 'ai' && isMathOrExamFile) {
      notify(`내용 ${q}덩이를 규칙으로 정리했습니다. (수식·그래프를 완벽히 살리시려면 무료 Gemini 키를 등록해 보세요.)`);
    } else {
      notify(`내용 ${q}덩이를 정리했습니다. 원본과 대조해 확인해 주세요.`);
    }
    await onDone({
      doc: res.doc,
      pages: res.pages,
      templateId: tplId,
      sourceName: srcName,
      engineUsed: res.engineUsed,
      markdown: res.markdown,
    });
  };

  const downloadParsedMd = () => {
    if (!parsedResult?.res?.markdown) return;
    const mdName = `${(parsedResult.title || '학습자료').replace(/[\\/:*?"<>|]/g, '_')}.md`;
    const blob = new Blob([parsedResult.res.markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: mdName }).click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setDownloadedMd(true);
    notify(`'${mdName}' 마크다운 파일이 다운로드되었습니다. 나중에 이 파일로 즉시 바로 생성할 수 있습니다.`);
  };

  const downloadAndFinish = () => {
    downloadParsedMd();
    setParsedResult(null);
    onCancel?.();
  };

  const downloadAndCreate = async () => {
    downloadParsedMd();
    await proceedCreate(parsedResult.res, parsedResult.templateId, parsedResult.sourceName);
  };

  const copyParsedMd = () => {
    if (!parsedResult?.res?.markdown) return;
    navigator.clipboard?.writeText(parsedResult.res.markdown).then(() => {
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 2000);
      notify('마크다운 텍스트를 클립보드에 복사했습니다.');
    });
  };

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
      const q = res.doc.blocks.length;
      if (!q) {
        notify('읽어 낸 내용이 없습니다. 다른 인식 방식을 골라 보세요.', 'err');
        setRunning(false);
        return;
      }
      setRunning(false);

      const sourceName = files.map((f) => f.name).join(', ') || '붙여넣기';
      const isAlreadyMd = tab === 'file' && files.length === 1 && /\.md$|\.markdown$/i.test(files[0].name);

      // 이미지 생성을 하지 않는 경우(텍스트만 있는 경우, kordoc 엔진 사용 시):
      // 이미 .md 파일을 올려 변환한 경우가 아니라면, 설정(mdAction)에 따라 바로 생성하거나 선택권을 제공
      if (res.engineUsed !== 'ai' && !isAlreadyMd) {
        if (mdAction === 'direct') {
          await proceedCreate(res, templateId, sourceName);
          return;
        }
        if (mdAction === 'download') {
          const mdName = `${(title || res.doc.title || '학습자료').replace(/[\\/:*?"<>|]/g, '_')}.md`;
          const blob = new Blob([res.markdown], { type: 'text/markdown;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          Object.assign(document.createElement('a'), { href: url, download: mdName }).click();
          setTimeout(() => URL.revokeObjectURL(url), 4000);
          notify(`'${mdName}' 마크다운 파일이 다운로드되었습니다. 나중에 이 파일을 올려 즉시 바로 생성할 수 있습니다.`);
          onCancel?.();
          return;
        }

        // mdAction === 'ask': 사용자에게 바로 생성 또는 다운로드 후 나중에 생성 선택권 제공
        setParsedResult({
          res,
          templateId,
          sourceName,
          title: title || res.doc.title || '새 학습자료',
        });
        setDownloadedMd(false);
        setCopiedMd(false);
        setShowPreview(false);
        return;
      }

      await proceedCreate(res, templateId, sourceName);
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
                  <Ic.Upload size={40} />
                  <h2>파일을 끌어다 놓거나 골라 주세요</h2>
                  <p>PDF(스캔본·손글씨 포함) · HWP · HWPX · DOCX · XLSX · TXT · MD · JSON · 사진(JPG·PNG)</p>
                  <button className="btn primary lg" onClick={() => input.current.click()}>파일 고르기</button>
                  <input
                    ref={input}
                    type="file"
                    multiple
                    hidden
                    accept=".pdf,.hwp,.hwpx,.hml,.docx,.xlsx,.xls,.txt,.md,.markdown,.json,.png,.jpg,.jpeg,.webp,image/*"
                    onChange={(e) => {
                      addFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </div>
                {!!files.length && (
                  <div className="filelist">
                    {files.map((f, i) => {
                      const isMd = /\.md$|\.markdown$/i.test(f.name);
                      return (
                        <div className="file" key={i}>
                          <span className={`ext ${isMd ? 'green' : ''}`}>{extLabel(f.name)}</span>
                          <span className="grow">
                            {f.name}
                            {isMd && (
                              <span className="chip green" style={{ marginLeft: 8, fontSize: 11, padding: '1px 6px' }}>
                                <Ic.Check size={11} /> 즉시 생성 가능
                              </span>
                            )}
                          </span>
                          <span className="muted" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{(f.size / 1024).toFixed(0)} KB</span>
                          <button className="icon-btn" onClick={() => setFiles(files.filter((_, k) => k !== i))} title="빼기">
                            <Ic.Close size={14} />
                          </button>
                        </div>
                      );
                    })}
                    <div className="hint">
                      여러 파일은 올린 순서대로 이어 붙여 한 학습자료로 만듭니다. 예전 .hwp·워드·엑셀·글자 있는 PDF·<b>마크다운(.md)</b>은 kordoc 으로 이 컴퓨터 안에서 바로 읽습니다.
                      <b style={{ display: 'block', marginTop: 4, color: 'var(--blue)' }}>이전에 다운로드한 .md 파일을 올리면 파싱 대기 없이 즉시 초고속으로 HWPX를 바로 생성합니다.</b>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <textarea
                  className="textarea paste"
                  placeholder={'수업 자료·학습지·필기 내용을 붙여 넣으세요.\n\n# 단원 제목\n## 1. 소제목\n본문 문단은 빈 줄로 나눕니다.\n- 목록 항목\n① 번호 목록\n| 표 | 머리 |'}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <div className="hint">
                  밑줄은 <code>__밑줄__</code>, 굵게는 <code>**굵게**</code>, 수식은 <code>{'$\\frac{1}{2}$'}</code> 같은 LaTeX 나 한글 수식 문법 <code>{'${1} over {2}$'}</code>, 화학식은 <code>{'$\\mathrm{H_2O}$'}</code>, 빈칸은 <code>[빈칸]</code> 으로 적으면 그대로 살아납니다.
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
              <div className="hint">기본 양식은 A4 2단 학습지 샘플입니다. 원하는 양식이 있으면 [양식] 메뉴에서 HWPX로 올려 그 모양 그대로 만들 수 있습니다.</div>
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
                {engine === 'auto' && '글자가 있는 문서는 규칙으로 빠르게, 스캔본·사진·손글씨는 AI로 빠르고 정확하게 구조화합니다.'}
                {engine === 'ai' && '모든 자료를 AI가 쪽마다 읽어 밑줄·상자·수식·그림까지 살려 정리합니다.'}
                {engine === 'rules' && 'AI 없이 제목(#)·목록 기호·표 같은 모양만 보고 즉시 나눕니다. 인터넷이 없어도 됩니다.'}
              </div>
            </div>
            <div className="field">
              <span className="lab">손글씨 처리</span>
              <div className="seg">
                {[
                  ['auto', '자동'],
                  ['include', '손글씨 포함'],
                  ['ignore', '인쇄 내용만'],
                ].map(([k, l]) => (
                  <button
                    key={k}
                    className={(handwriting || 'auto') === k ? 'on' : ''}
                    onClick={() => setHandwriting(k)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div className="hint">
                {(handwriting || 'auto') === 'auto' &&
                  '자료의 성격에 맞춰 자동 판단합니다. 시험지·교재 위의 풀이 흔적·낙서는 걸러내고, 판서 사진·자필 노트·활동지 답안은 내용으로 살립니다.'}
                {handwriting === 'include' &&
                  '손으로 쓴 판서·필기·원고를 빠르게 읽어 내용 그대로 깔끔한 문서로 정리합니다. 흐린 글자는 맥락으로 채우고 노란색으로 표시해 ‘확인 필요’로 둡니다.'}
                {handwriting === 'ignore' &&
                  '풀이 흔적·체크·낙서가 있는 자료도 인쇄된 내용만 옮깁니다.'}
              </div>
            </div>
            <div className="field">
              <span className="lab">MD 파싱 후 작업</span>
              <div className="seg">
                {[
                  ['ask', '선택 창 표시'],
                  ['direct', '바로 생성'],
                  ['download', 'MD 다운로드만'],
                ].map(([k, l]) => (
                  <button
                    key={k}
                    className={(mdAction || 'ask') === k ? 'on' : ''}
                    onClick={() => setMdAction(k)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div className="hint">
                {(mdAction || 'ask') === 'ask' &&
                  '텍스트 파싱 후 [지금 바로 생성]할지, [MD 다운로드 후 나중에 생성]할지 선택 창을 띄웁니다.'}
                {mdAction === 'direct' &&
                  '파싱이 끝나면 확인 창 없이 즉시 학습자료(HWPX)를 생성하고 편집을 시작합니다.'}
                {mdAction === 'download' &&
                  '파싱된 .md 파일을 내 컴퓨터에 다운로드하고 완료합니다. (나중에 .md 파일로 언제든 바로 생성 가능)'}
              </div>
            </div>
            {!settings.apiKey && (engine === 'ai' || needsAi || isMathOrExamFile) && (
              <div className="notice-box" style={{ marginBottom: 12 }}>
                {isMathOrExamFile ? (
                  <>
                    수학·과학 시험지는 <b>무료 Gemini API 키</b>를 등록하시면 수식(LaTeX)과 도형·그래프 그림까지 100% 온전하게 추출됩니다.{' '}
                    <button className="btn sm" onClick={onSettings}><Ic.Key size={13} /> 키 등록하기 (무료)</button>
                  </>
                ) : (
                  <>
                    AI 인식에는 선생님 본인의 <b>무료 Gemini API 키</b>가 필요합니다. 1분이면 받을 수 있어요.{' '}
                    <button className="btn sm" onClick={onSettings}><Ic.Key size={13} /> 키 넣으러 가기</button>
                  </>
                )}
              </div>
            )}
            <button className="btn-start" disabled={!canStart} onClick={start}>
              {running ? <><span className="spin" style={{ borderColor: 'rgba(255,255,255,.4)', borderTopColor: '#fff' }} /> 변환 중…</> : <><Ic.Sparkle size={20} /> 변환 시작</>}
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

      {parsedResult && (
        <div className="modal-bg" onClick={() => setParsedResult(null)}>
          <div className="modal" style={{ maxWidth: 660 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="chip green"><Ic.Check size={13} /> kordoc 파싱 완료</span>
                <span>다음 작업을 선택해 주세요</span>
              </span>
              <span className="grow" />
              <button className="icon-btn" onClick={() => setParsedResult(null)} title="닫기">
                <Ic.Close size={16} />
              </button>
            </div>
            <div className="modal-b">
              <p style={{ margin: '0 0 14px', fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                이미지 생성이 불필요하여 <b>kordoc 엔진</b>으로 문서를 초고속 파싱했습니다.<br />
                <b>지금 바로 HWPX 문서를 생성</b>할 수도 있고, <b>MD 파일로 다운로드하여 나중에 생성</b>할 수도 있습니다.
              </p>

              <div className="choice-grid">
                <div
                  className="choice-card primary"
                  onClick={() => proceedCreate(parsedResult.res, parsedResult.templateId, parsedResult.sourceName)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ background: 'var(--blue)', color: '#fff', borderRadius: 8, width: 28, height: 28, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      <Ic.Sparkle size={15} />
                    </span>
                    <b style={{ fontSize: 15, color: '#1e40af' }}>바로 문서 생성</b>
                    <span className="chip solid-blue" style={{ marginLeft: 'auto', fontSize: 11 }}>추천</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                    추가 다운로드 없이 지금 즉시 HWPX 학습자료를 만들고 편집을 시작합니다.
                  </p>
                  <button className="btn primary sm" style={{ marginTop: 'auto', width: '100%', justifyContent: 'center' }}>
                    지금 바로 생성하기 →
                  </button>
                </div>

                <div
                  className="choice-card secondary"
                  onClick={downloadAndFinish}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ background: '#059669', color: '#fff', borderRadius: 8, width: 28, height: 28, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      <Ic.Download size={15} />
                    </span>
                    <b style={{ fontSize: 15, color: '#065f46' }}>다운로드 (나중에 생성)</b>
                  </div>
                  <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                    .md 파일을 내 컴퓨터에 저장하고 완료합니다. 나중에 이 파일을 올려 즉시 바로 생성할 수 있습니다.
                  </p>
                  <button className="btn sm" style={{ marginTop: 'auto', width: '100%', justifyContent: 'center', fontWeight: 600, color: '#065f46', borderColor: '#a7f3d0' }}>
                    <Ic.Download size={13} /> MD 다운로드 후 저장
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', margin: '0 0 14px' }}>
                <button className="btn sm ghost" onClick={downloadAndCreate} style={{ gap: 6 }}>
                  <Ic.Download size={13} /> MD 파일 다운로드도 하고 지금 바로 생성하기
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
                <div style={{ background: 'var(--bg-1, #f8fafc)', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}>문서 제목</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={parsedResult.title}>
                    {parsedResult.title}
                  </div>
                </div>
                <div style={{ background: 'var(--bg-1, #f8fafc)', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}>생성된 내용</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)' }}>
                    {parsedResult.res.doc.blocks.length}개 블록
                  </div>
                </div>
                <div style={{ background: 'var(--bg-1, #f8fafc)', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}>마크다운 글자수</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-1)' }}>
                    {(parsedResult.res.markdown || '').length.toLocaleString()}자
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <button
                    className="btn sm ghost"
                    onClick={() => setShowPreview(!showPreview)}
                    style={{ padding: '2px 6px', fontSize: 12.5, color: 'var(--ink-2)', gap: 4 }}
                  >
                    {showPreview ? <Ic.Up size={13} /> : <Ic.Down size={13} />}
                    파싱된 마크다운 내용 {showPreview ? '접기' : '미리보기'}
                  </button>
                  {showPreview && (
                    <button className="btn sm ghost" onClick={copyParsedMd} style={{ gap: 4 }}>
                      <Ic.Copy size={13} /> {copiedMd ? '복사됨!' : '전체 복사'}
                    </button>
                  )}
                </div>

                {showPreview && (
                  <div className="md-preview">
                    {parsedResult.res.markdown || '(마크다운 내용 없음)'}
                  </div>
                )}
              </div>

              {downloadedMd && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: '#ecfdf3', border: '1px solid #a6f4c5', borderRadius: 8, color: '#027a48', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Ic.Check size={14} /> <b>MD 파일 다운로드 완료!</b> 나중에 새 변환 화면에 이 파일을 올리면 즉시 바로 HWPX가 생성됩니다.
                </div>
              )}
            </div>
            <div className="modal-f" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <button className="btn ghost" onClick={() => setParsedResult(null)}>
                취소
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={downloadParsedMd} style={{ fontWeight: 600 }}>
                  <Ic.Download size={15} /> {downloadedMd ? 'MD 파일 다시 받기' : 'MD 파일 다운로드 (.md)'}
                </button>
                <button
                  className="btn primary"
                  onClick={() => proceedCreate(parsedResult.res, parsedResult.templateId, parsedResult.sourceName)}
                >
                  <Ic.Sparkle size={15} /> 바로 학습자료(HWPX) 생성 →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
      {theme === 'sample' && (
        <>
          <rect x="4" y="7" width="8" height="1.6" fill="#555" />
          <rect x="15" y="5.5" width="16" height="4" fill="#111" />
          <rect x="34" y="5" width="8" height="1.3" fill="#777" />
          <rect x="34" y="8" width="8" height="1.3" fill="#777" />
          <path d="M4 12.5h38" stroke="#111" strokeWidth="1" />
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
