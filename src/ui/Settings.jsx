import { useState } from 'react';
import * as Ic from './icons.jsx';
import { listModels, DEFAULT_MODEL, DEFAULT_IMAGE_MODEL, normalizeModelName } from '../services/gemini.js';

export default function Settings({ settings, setSettings, notify, tab: initialTab }) {
  const [tab, setTab] = useState(initialTab === 'help' ? 'help' : 'ai');
  const [key, setKey] = useState(settings.apiKey);
  const [show, setShow] = useState(false);
  const [models, setModels] = useState([]);
  const [checking, setChecking] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const check = async () => {
    setChecking(true);
    try {
      const m = await listModels(key.trim());
      setModels(m);
      const model = settings.model && m.some((x) => x.id === settings.model) ? settings.model : m[0]?.id || DEFAULT_MODEL;
      setSettings({ ...settings, apiKey: key.trim(), model });
      notify(`키가 확인됐습니다. 모델 ${m.length}개를 쓸 수 있어요.`);
    } catch (e) {
      notify(`키 확인 실패: ${e.message}`, 'err');
    }
    setChecking(false);
  };

  return (
    <div className="content">
      <div className="crumb">내 스페이스 › 설정</div>
      <div className="page-title">
        <span className="sq" style={{ background: '#8a919c' }} />
        <h1>설정</h1>
      </div>
      <div className="tabs">
        <button className={`tab ${tab === 'ai' ? 'on' : ''}`} onClick={() => setTab('ai')}>AI 인식</button>
        <button className={`tab ${tab === 'privacy' ? 'on' : ''}`} onClick={() => setTab('privacy')}>개인정보 · 저장</button>
        <button className={`tab ${tab === 'help' ? 'on' : ''}`} onClick={() => setTab('help')}>도움말</button>
      </div>

      {tab === 'ai' && (
        <div className="settings-grid">
          <div className="notice-box">
            스캔본·사진·손글씨 학습자료는 Google 의 <b>Gemini</b> 가 읽습니다. 선생님 본인의 무료 키를 쓰므로 이 앱에는 비용이 없고,
            요청은 이 브라우저에서 Google 로 <b>직접</b> 갑니다. 무료 사용량 안에서는 결제가 일어나지 않습니다.
          </div>
          <div className="kv">
            <div className="k">
              Gemini 통합 API 키
              <small>키 하나로 문서·수식 인식 및 이미지 생성에 모두 자동 연동됩니다.</small>
            </div>
            <div>
              <div className="row-inline">
                <input className="input" style={{ maxWidth: 380 }} type={show ? 'text' : 'password'} value={key} placeholder="AIza…" onChange={(e) => setKey(e.target.value)} autoComplete="off" />
                <button className="btn sm ghost" onClick={() => setShow(!show)}>{show ? '숨기기' : '보기'}</button>
                <button className="btn primary sm" onClick={check} disabled={!key.trim() || checking}>{checking ? '확인 중…' : '확인하고 저장'}</button>
                {settings.apiKey && <button className="btn sm danger" onClick={() => { setKey(''); setSettings({ ...settings, apiKey: '' }); notify('키를 지웠습니다.'); }}>지우기</button>}
              </div>
              <ol className="hint" style={{ paddingLeft: 18 }}>
                <li><a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Google AI Studio → API 키</a> 에 접속해 로그인</li>
                <li>‘API 키 만들기’ → 생긴 키를 복사해 위 칸에 붙여 넣기</li>
                <li>‘확인하고 저장’ — 키는 이 컴퓨터의 브라우저에만 저장되며, <b>문서 인식과 이미지 생성에 자동 공통 적용</b>됩니다</li>
              </ol>
              {settings.apiKey && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                  <span className="chip green"><Ic.Shield size={12} /> Gemini API 키 등록 완료</span>
                  <span className="chip solid-blue"><Ic.Check size={12} /> 문서/수식 인식 연동</span>
                  <span className="chip solid-blue"><Ic.Check size={12} /> 이미지 생성 자동 연동</span>
                </div>
              )}
            </div>
          </div>
          <div className="kv">
            <div className="k">문서·수식 인식 모델<small>최신 Flash 계열이 빠르고 무료 사용량이 넉넉합니다.</small></div>
            <div className="row-inline">
              {models.length ? (
                <select className="select" style={{ maxWidth: 380 }} value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value })}>
                  {models.map((m) => <option key={m.id} value={m.id}>{m.label} ({m.id})</option>)}
                </select>
              ) : (
                <>
                  <input className="input" style={{ maxWidth: 260 }} value={settings.model || ''} placeholder={DEFAULT_MODEL} onChange={(e) => setSettings({ ...settings, model: e.target.value })} />
                  {settings.apiKey && <button className="btn sm" onClick={async () => { try { setModels(await listModels(settings.apiKey)); } catch (e) { notify(e.message, 'err'); } }}>목록 불러오기</button>}
                </>
              )}
            </div>
          </div>
          <div className="kv">
            <div className="k">
              이미지 생성 모델
              <small>문제에 삽입할 삽화·도형·그래프 생성 시 사용합니다.</small>
            </div>
            <div>
              <div className="row-inline">
                <input
                  className="input"
                  style={{ maxWidth: 320 }}
                  value={settings.imageModel || DEFAULT_IMAGE_MODEL}
                  placeholder={DEFAULT_IMAGE_MODEL}
                  onChange={(e) => setSettings({ ...settings, imageModel: normalizeModelName(e.target.value) })}
                />
                <span className="chip blue">기본 모델: {DEFAULT_IMAGE_MODEL}</span>
              </div>
              <div className="hint" style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                {settings.apiKey ? (
                  <span style={{ color: 'var(--blue)', fontWeight: 600 }}>
                    <Ic.Check size={13} style={{ verticalAlign: -2 }} /> 등록된 Gemini API 키에 자동 연동되어 작동합니다 (별도 키 불필요).
                  </span>
                ) : (
                  <span style={{ color: 'var(--ink-3)' }}>
                    위 'Gemini API 키'를 등록하면 이미지 생성 기능에도 자동으로 함께 연동됩니다.
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="kv">
            <div className="k">기본 인식 방식</div>
            <div className="seg">
              {[['auto', '자동'], ['ai', 'AI 정밀'], ['rules', '빠른 규칙']].map(([k, l]) => (
                <button key={k} className={settings.engine === k ? 'on' : ''} onClick={() => setSettings({ ...settings, engine: k })}>{l}</button>
              ))}
            </div>
          </div>
          <div className="kv">
            <div className="k">손글씨 처리 기본값<small>시험지 위 낙서는 걸러내고 판서·필기·서술형 답안은 살립니다.</small></div>
            <div className="seg">
              {[
                ['auto', '자동'],
                ['include', '손글씨 포함'],
                ['ignore', '인쇄 내용만'],
              ].map(([k, l]) => (
                <button
                  key={k}
                  className={(settings.handwriting || 'auto') === k ? 'on' : ''}
                  onClick={() => setSettings({ ...settings, handwriting: k })}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="kv">
            <div className="k">
              MD 파싱 결과 처리
              <small>텍스트를 kordoc 엔진으로 파싱한 뒤 바로 생성할지, MD 파일로 다운로드해 보관할지 선택합니다.</small>
            </div>
            <div className="seg">
              {[
                ['ask', '선택 창 표시'],
                ['direct', '바로 생성'],
                ['download', 'MD 다운로드'],
              ].map(([k, l]) => (
                <button
                  key={k}
                  className={(settings.mdAction || 'ask') === k ? 'on' : ''}
                  onClick={() => setSettings({ ...settings, mdAction: k })}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'privacy' && (
        <div className="settings-grid">
          <div className="notice-box green">
            <b>auto-typer 는 이 컴퓨터에서만 동작합니다.</b> 앱은 127.0.0.1 로만 열려 같은 네트워크의 다른 기기도 접속할 수 없고,
            글꼴·PDF 해독 자료까지 앱 안에 들어 있어 인터넷 없이 쓸 수 있습니다. 올린 파일, 변환 결과, 양식, API 키는 이 브라우저에만 저장됩니다.
            앱 밖으로 나가는 통신은 <b>AI 인식(Gemini) 하나뿐</b>이며, 브라우저 보안 정책으로 그 외 주소는 모두 차단되어 있습니다.
            AI 인식을 켜면 해당 쪽 이미지가 선생님 키로 Google 에 보내지므로, 학생 개인정보가 들어간 답안지는 AI 인식에 쓰지 마세요.
          </div>
          <div className="kv">
            <div className="k">이 컴퓨터의 자료 지우기<small>모든 학습자료·양식·설정을 지웁니다.</small></div>
            <div>
              <button
                className="btn danger"
                onClick={() => setConfirmClear(true)}
              >
                <Ic.Trash size={14} /> 모두 지우기
              </button>
            </div>
          </div>

          {confirmClear && (
            <div className="modal-bg" onClick={() => setConfirmClear(false)}>
              <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-h">
                  <span>저장된 자료 전체 삭제</span>
                  <span className="grow" />
                  <button className="icon-btn" onClick={() => setConfirmClear(false)} title="닫기">
                    <Ic.Close size={16} />
                  </button>
                </div>
                <div className="modal-b" style={{ fontSize: 14.5, color: 'var(--ink-2)', lineHeight: 1.6, padding: '12px 18px 20px' }}>
                  이 브라우저에 저장된 모든 학습자료·양식·설정을 지울까요?<br />
                  삭제된 자료는 되돌릴 수 없습니다.
                </div>
                <div className="modal-f">
                  <button className="btn" onClick={() => setConfirmClear(false)}>취소</button>
                  <button
                    className="btn danger"
                    style={{ background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }}
                    onClick={async () => {
                      setConfirmClear(false);
                      localStorage.clear();
                      await new Promise((r) => { const q = indexedDB.deleteDatabase('auto-typer'); q.onsuccess = q.onerror = q.onblocked = r; });
                      location.reload();
                    }}
                  >
                    모두 지우기
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'help' && (
        <div className="settings-grid" style={{ lineHeight: 1.75, fontSize: 13.5 }}>
          <h3>빠른 사용법</h3>
          <ol>
            <li>왼쪽 파란 <b>+</b> → 파일을 올리거나 글을 붙여 넣고, 만들 양식을 고른 뒤 <b>변환 시작</b>.</li>
            <li><b>내용</b>·<b>검토 보드</b>에서 내용을 하나씩 눌러 오른쪽 패널에서 원본과 대조해 고칩니다. ‘확인 필요’는 AI 가 흐리게 읽은 곳이고, <mark className="guess">노란 글자</mark>는 맥락으로 추정해 채운 낱말입니다.</li>
            <li><b>미리보기</b>에서 지면을 확인하고 <b>머리글 편집</b>으로 학교명·학습 자료명 등 머리 문구를 바꿉니다(샘플 양식은 머리 표가 모든 쪽에 되풀이됩니다).</li>
            <li><b>HWPX 내려받기</b> 또는 <b>PDF</b>(인쇄 창에서 ‘PDF로 저장’).</li>
          </ol>
          <h3>글자 표기</h3>
          <table className="table" style={{ maxWidth: 560 }}>
            <tbody>
              <tr><td><code>__밑줄__</code></td><td>밑줄 (지문 속 ① __단어__ 처럼)</td></tr>
              <tr><td><code>**굵게**</code></td><td>굵게 (‘않은’, ‘틀린’ 강조)</td></tr>
              <tr><td><code>{'$\\frac{a}{b}$'}</code></td><td>수식 — LaTeX(<code>{'\\sqrt{x}'}</code>, <code>{'\\sum_{k=1}^{n}'}</code>, 행렬) 나 한글 수식 문법(<code>{'{a} over {b}'}</code>) 모두 됩니다. 한글에는 한글 수식으로 들어갑니다.</td></tr>
              <tr><td><code>{'$\\mathrm{H_2O}$'}</code></td><td>화학식·단위 (<code>{'\\ce{SO4^2-}'}</code>, <code>{'9.8\\,\\mathrm{m/s^2}'}</code>, 가역 반응 <code>{'\\rightleftharpoons'}</code>)</td></tr>
              <tr><td><code>[빈칸]</code></td><td>밑줄 빈칸</td></tr>
              <tr><td>줄바꿈</td><td>문단 나눔</td></tr>
            </tbody>
          </table>
          <h3>지원 형식</h3>
          <p>입력: PDF(글자 PDF·스캔본·손글씨), hwp(예전 한글), hwpx, docx, xlsx, txt, md, json, 사진 / 출력: hwpx(한글 2014 이상), PDF.<br />예전 hwp·워드·엑셀·글자 있는 PDF 는 <a href="https://github.com/KKHLAND/kordoc" target="_blank" rel="noreferrer">kordoc</a>(MIT)으로 이 컴퓨터 안에서 읽고, 스캔본·사진·손글씨는 AI(Gemini)가 읽습니다. 암호가 걸린 문서는 한글에서 암호를 푼 뒤 올려 주세요.</p>
        </div>
      )}
    </div>
  );
}
