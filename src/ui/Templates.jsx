import { useEffect, useRef, useState } from 'react';
import * as Ic from './icons.jsx';
import { TplThumb } from './NewJob.jsx';
import { addCustomTemplate, listTemplates, loadTemplate, removeCustomTemplate, saveTemplateSlots } from '../services/templates.js';

const KIND_NAME = { field: '누름틀', cell: '표 칸', lines: '답 줄' };

const ROLE_NAMES = { body: '본문', list: '목록', heading: '소제목' };

export default function Templates({ notify }) {
  const [list, setList] = useState([]);
  const [info, setInfo] = useState({});
  const [busy, setBusy] = useState(false);
  const [delTarget, setDelTarget] = useState(null);
  const [slotTarget, setSlotTarget] = useState(null); // {meta, slots}
  const input = useRef(null);

  const refresh = async () => {
    const l = await listTemplates();
    setList(l);
    const m = {};
    for (const t of l) {
      try {
        const e = await loadTemplate(t.id);
        m[t.id] = { ...e.analysis, slots: e.form?.slots };
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
      const { meta, analysis, slots } = await addCustomTemplate(file);
      const s = analysis.stats;
      if (slots?.length) {
        notify(`채울 칸 ${slots.length}개를 찾았습니다. 칸 이름을 확인해 주세요.`);
        await refresh();
        setSlotTarget({ meta, slots });
      } else {
        notify(`양식을 배웠습니다: 문단 ${s.paragraphs}개에서 소제목 ${s.heading}단계 · 본문 · 목록 서식을 읽었습니다`);
        await refresh();
      }
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
        <b>학생 답안지를 양식에 채우는 법</b> — 수행평가 답안지·활동지 hwpx 를 <b>빈 칸 그대로</b> 올리세요. 학번·이름 칸, 답 상자(표 칸), 문항 아래 빈 줄·밑줄 줄, 누름틀을
        ‘채울 칸’으로 찾아 둡니다. [새 변환]에서 이 양식을 고르고 학생 답안지 스캔(PDF)을 올리면, 학생마다 양식 한 부씩 손글씨를 칸에 옮겨 적은 hwpx 를 만듭니다.
        <br />
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
                {a?.slots?.length > 0 && (
                  <div className="roles" style={{ marginTop: 4 }}>
                    <span className="chip blue"><Ic.Check size={11} /> 채울 칸 {a.slots.filter((x) => !x.off).length}개</span>
                    <button className="btn sm" onClick={() => setSlotTarget({ meta: t, slots: a.slots })}>칸 확인·이름 고치기</button>
                  </div>
                )}
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

      {slotTarget && (
        <SlotModal
          target={slotTarget}
          onClose={() => setSlotTarget(null)}
          onSave={async (slots) => {
            await saveTemplateSlots(slotTarget.meta.id, slots);
            setSlotTarget(null);
            notify('칸 설정을 저장했습니다.');
            refresh();
          }}
        />
      )}

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

/** 찾은 칸 확인: 이름 고치기(AI 가 이 이름으로 답을 찾는다)·켜고 끄기 */
function SlotModal({ target, onClose, onSave }) {
  const [slots, setSlots] = useState(target.slots.map((x) => ({ ...x })));
  const set = (i, patch) => setSlots(slots.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width: 'min(680px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          채울 칸 확인 — {target.meta.name} <span className="grow" />
          <button className="icon-btn" aria-label="닫기" onClick={onClose}><Ic.Close size={16} /></button>
        </div>
        <div className="modal-b">
          <div className="hint" style={{ marginBottom: 10 }}>
            양식에서 찾은 빈 칸입니다. 학생이 쓰는 칸만 켜 두세요(점수·확인 칸처럼 선생님이 쓰는 칸은 처음부터 꺼 두었습니다).
            칸 이름은 AI 가 답안지에서 그 칸을 찾는 실마리이니 ‘1번 답’처럼 알아보기 쉽게 고쳐도 됩니다.
          </div>
          {slots.map((s, i) => (
            <div key={s.id} className="slot-row" style={{ opacity: s.off ? 0.5 : 1 }}>
              <input type="checkbox" checked={!s.off} onChange={(e) => set(i, { off: !e.target.checked })} aria-label={`${s.label} 채우기`} />
              <span className="chip gray" style={{ minWidth: 52, justifyContent: 'center' }}>{KIND_NAME[s.kind]}</span>
              <input className="input" value={s.label} onChange={(e) => set(i, { label: e.target.value })} />
            </div>
          ))}
        </div>
        <div className="modal-f">
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn primary" onClick={() => onSave(slots.map((x) => ({ ...x, label: x.label.trim() || x.id })))}>저장</button>
        </div>
      </div>
    </div>
  );
}
