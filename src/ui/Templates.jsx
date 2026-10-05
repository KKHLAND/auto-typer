import { useEffect, useRef, useState } from 'react';
import * as Ic from './icons.jsx';
import { TplThumb } from './NewJob.jsx';
import { addCustomTemplate, listTemplates, loadTemplate, removeCustomTemplate } from '../services/templates.js';

const ROLE_NAMES = { body: '본문', list: '목록', heading: '소제목' };

export default function Templates({ notify }) {
  const [list, setList] = useState([]);
  const [info, setInfo] = useState({});
  const [busy, setBusy] = useState(false);
  const [delTarget, setDelTarget] = useState(null);
  const input = useRef(null);

  const refresh = async () => {
    const l = await listTemplates();
    setList(l);
    const m = {};
    for (const t of l) {
      try {
        const e = await loadTemplate(t.id);
        m[t.id] = e.analysis;
      } catch {
        /* 깨진 양식은 건너뜀 */
      }
    }
    setInfo(m);
  };
  useEffect(() => {
    refresh();
  }, []);

  const upload = async (file) => {
    if (!file) return;
    if (!/\.hwpx$/i.test(file.name)) return notify('양식은 hwpx 파일로 올려 주세요. (한글: 다른 이름으로 저장 → hwpx)', 'err');
    setBusy(true);
    try {
      const { analysis } = await addCustomTemplate(file);
      const s = analysis.stats;
      notify(`양식을 배웠습니다: 문단 ${s.paragraphs}개에서 소제목 ${s.heading}단계 · 본문 · 목록 서식을 읽었습니다`);
      await refresh();
    } catch (e) {
      notify(`양식을 읽지 못했습니다: ${e.message}`, 'err');
    }
    setBusy(false);
  };

  return (
    <div className="content">
      <div className="crumb">내 스페이스 › 양식</div>
      <div className="page-title">
        <span className="sq" style={{ background: '#12b76a' }} />
        <h1>양식</h1>
        <div className="acts">
          <button className="btn primary" onClick={() => input.current.click()} disabled={busy}>
            {busy ? <span className="spin" /> : <Ic.Upload size={15} />} 우리 학교 양식 올리기
          </button>
          <input ref={input} type="file" accept=".hwpx" hidden onChange={(e) => { upload(e.target.files[0]); e.target.value = ''; }} />
        </div>
      </div>

      <div className="notice-box green">
        <b>원하는 양식을 쓰는 법</b> — 이런 모양으로 만들고 싶은 hwpx(학습지·수업 자료·시험지 무엇이든) 하나를 그대로 올리세요.
        첫 쪽의 머리 표·머리말·바닥글·쪽 크기·단 설정은 그대로 두고, 본문의 소제목·본문·목록이 쓰는 글꼴·크기·들여쓰기를 배워
        읽은 내용을 그 모양에 그대로 담습니다. 올린 양식의 내용은 저장하지 않고 서식만 남깁니다.
      </div>

      <div className="tpl-cards">
        {list.map((t) => {
          const a = info[t.id];
          return (
            <div className="tpl-card" key={t.id}>
              <div className="thumb"><TplThumb theme={t.theme} color={t.color} big /></div>
              <div className="body">
                <b>{t.name}</b>
                <span>{t.desc}</span>
                {a && (
                  <div className="roles" style={{ marginTop: 4 }}>
                    {Object.entries(ROLE_NAMES).map(([k, label]) => (
                      a.stats?.[k] ? (
                        <span key={k} className="chip green"><Ic.Check size={11} /> {label} 서식</span>
                      ) : (
                        <span key={k} className="chip gray" title="양식에 없어 본문 서식에서 만들어 씁니다">{label} 자동</span>
                      )
                    ))}
                  </div>
                )}
              </div>
              <div className="foot">
                {t.custom ? (
                  <button className="btn sm danger" onClick={() => setDelTarget(t)}>
                    <Ic.Trash size={13} /> 지우기
                  </button>
                ) : (
                  <span className="chip gray">기본 제공</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {delTarget && (
        <div className="modal-bg" onClick={() => setDelTarget(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">
              <span>양식 삭제</span>
              <span className="grow" />
              <button className="icon-btn" onClick={() => setDelTarget(null)} title="닫기">
                <Ic.Close size={16} />
              </button>
            </div>
            <div className="modal-b" style={{ fontSize: 14.5, color: 'var(--ink-2)', lineHeight: 1.6, padding: '12px 18px 20px' }}>
              ‘<b>{delTarget.name}</b>’ 양식을 지울까요?
            </div>
            <div className="modal-f">
              <button className="btn" onClick={() => setDelTarget(null)}>취소</button>
              <button
                className="btn danger"
                style={{ background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }}
                onClick={async () => {
                  await removeCustomTemplate(delTarget.id);
                  setDelTarget(null);
                  refresh();
                }}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
