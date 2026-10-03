import { useState } from 'react';
import * as Ic from './icons.jsx';
import { listModels, DEFAULT_MODEL } from '../services/gemini.js';

export default function Settings({ settings, setSettings, notify, tab: initialTab }) {
  const [tab, setTab] = useState(initialTab === 'help' ? 'help' : 'ai');
  const [key, setKey] = useState(settings.apiKey);
  const [show, setShow] = useState(false);
  const [models, setModels] = useState([]);
  const [checking, setChecking] = useState(false);

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
            스캔본·사진·손글씨 시험지는 Google 의 <b>Gemini</b> 가 읽습니다. 선생님 본인의 무료 키를 쓰므로 이 앱에는 비용이 없고,
            요청은 이 브라우저에서 Google 로 <b>직접</b> 갑니다. 무료 사용량 안에서는 결제가 일어나지 않습니다.
          </div>
          <div className="kv">
            <div className="k">Gemini API 키<small>Google 계정만 있으면 1분 안에 무료로 받습니다.</small></div>
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
                <li>‘확인하고 저장’ — 키는 이 컴퓨터의 브라우저에만 저장됩니다</li>
              </ol>
              {settings.apiKey && <span className="chip green"><Ic.Shield size={12} /> 키가 저장되어 있습니다</span>}
            </div>
          </div>
          <div className="kv">
            <div className="k">모델<small>최신 Flash 계열이 빠르고 무료 사용량이 넉넉합니다.</small></div>
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
            <div className="k">기본 인식 방식</div>
            <div className="seg">
              {[['auto', '자동'], ['ai', 'AI 정밀'], ['rules', '빠른 규칙']].map(([k, l]) => (
                <button key={k} className={settings.engine === k ? 'on' : ''} onClick={() => setSettings({ ...settings, engine: k })}>{l}</button>
              ))}
            </div>
          </div>
          <div className="kv">
            <div className="k">필기 처리 기본값</div>
            <div className="seg">
              <button className={settings.handwriting === 'ignore' ? 'on' : ''} onClick={() => setSettings({ ...settings, handwriting: 'ignore' })}>인쇄 내용만</button>
              <button className={settings.handwriting === 'include' ? 'on' : ''} onClick={() => setSettings({ ...settings, handwriting: 'include' })}>손글씨도 타이핑</button>
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
            <div className="k">이 컴퓨터의 자료 지우기<small>모든 시험지·양식·설정을 지웁니다.</small></div>
            <div>
              <button
                className="btn danger"
                onClick={async () => {
                  if (!confirm('이 브라우저에 저장된 모든 시험지·양식·설정을 지울까요? 되돌릴 수 없습니다.')) return;
                  localStorage.clear();
                  await new Promise((r) => { const q = indexedDB.deleteDatabase('auto-typer'); q.onsuccess = q.onerror = q.onblocked = r; });
                  location.reload();
                }}
              >
                <Ic.Trash size={14} /> 모두 지우기
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'help' && (
        <div className="settings-grid" style={{ lineHeight: 1.75, fontSize: 13.5 }}>
          <h3>빠른 사용법</h3>
          <ol>
            <li>왼쪽 파란 <b>+</b> → 파일을 올리거나 글을 붙여 넣고, 만들 양식을 고른 뒤 <b>변환 시작</b>.</li>
            <li><b>리스트</b>·<b>검토 보드</b>에서 문항을 하나씩 눌러 오른쪽 패널에서 원본과 대조해 고칩니다. ‘확인 필요’는 AI 가 흐리게 읽은 곳입니다.</li>
            <li><b>미리보기</b>에서 지면을 확인하고 <b>머리글 편집</b>으로 학년도·시험명·과목을 바꿉니다.</li>
            <li><b>HWPX 내려받기</b> 또는 <b>PDF</b>(인쇄 창에서 ‘PDF로 저장’).</li>
          </ol>
          <h3>글자 표기</h3>
          <table className="table" style={{ maxWidth: 560 }}>
            <tbody>
              <tr><td><code>__밑줄__</code></td><td>밑줄 (지문 속 ① __단어__ 처럼)</td></tr>
              <tr><td><code>**굵게**</code></td><td>굵게 (‘않은’, ‘틀린’ 강조)</td></tr>
              <tr><td><code>$x^{'{2}'}+1$</code></td><td>한글 수식 (분수 <code>{'{a} over {b}'}</code>, 루트 <code>sqrt {'{x}'}</code>)</td></tr>
              <tr><td><code>[빈칸]</code></td><td>밑줄 빈칸</td></tr>
              <tr><td>줄바꿈</td><td>문단 나눔</td></tr>
            </tbody>
          </table>
          <h3>지원 형식</h3>
          <p>입력: PDF(글자 PDF·스캔본·손글씨), hwpx, txt, md, json, 사진 / 출력: hwpx(한글 2014 이상), PDF.<br />예전 .hwp 는 한글에서 ‘다른 이름으로 저장 → hwpx’ 후 올려 주세요.</p>
        </div>
      )}
    </div>
  );
}
