import { useEffect, useRef, useState } from 'react';
import * as Ic from './icons.jsx';
import { TplThumb } from './NewJob.jsx';
import { addCustomTemplate, listTemplates, loadTemplate, removeCustomTemplate } from '../services/templates.js';

const ROLE_NAMES = { stem: '발문', choice: '선지', passage: '지문', group: '묶음 지시문', number: '문항 번호', spacer: '빈 줄' };

export default function Templates({ notify }) {
  const [list, setList] = useState([]);
  const [info, setInfo] = useState({});
  const [busy, setBusy] = useState(false);
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
      notify(`양식을 배웠습니다: 발문 ${s.stem} · 선지 ${s.choice} · 지문 ${s.passage} 개의 서식 표본`);
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
        <b>우리 학교 양식을 쓰는 법</b> — 예전에 낸 시험지 hwpx 하나를 그대로 올리세요. 첫 쪽의 머리 표·머리말·바닥글·쪽 크기·단 설정은 그대로 두고,
        본문에서 발문·지문·선지·묶음 지시문이 각각 어떤 글자 모양·문단 모양을 쓰는지 배워 새 시험지에 똑같이 입힙니다.
        시험 문항 내용은 저장하지 않고 서식만 남깁니다.
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
                    {Object.entries(a.stats)
                      .filter(([k, v]) => v && ROLE_NAMES[k] && k !== 'spacer')
                      .map(([k]) => <span key={k} className="chip green"><Ic.Check size={11} /> {ROLE_NAMES[k]}</span>)}
                    {a.profile.stemAutoNumber && <span className="chip blue">자동 번호 양식</span>}
                  </div>
                )}
              </div>
              <div className="foot">
                {t.custom ? (
                  <button className="btn sm danger" onClick={async () => { if (confirm('이 양식을 지울까요?')) { await removeCustomTemplate(t.id); refresh(); } }}>
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
    </div>
  );
}
