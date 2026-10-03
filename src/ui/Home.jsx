import * as Ic from './icons.jsx';
import { BUILTIN } from '../services/templates.js';

const fmt = (t) => {
  const d = new Date(t);
  return `${String(d.getFullYear()).slice(2)}. ${d.getMonth() + 1}. ${d.getDate()}.`;
};

export function reviewStats(doc) {
  const qs = doc.items.filter((i) => i.kind !== 'text');
  const done = qs.filter((i) => i.flag === 'done').length;
  const check = qs.filter((i) => i.flag === 'check').length;
  return { total: qs.length, questions: doc.items.filter((i) => i.kind === 'question').length, done, check, pct: qs.length ? Math.round((done / qs.length) * 100) : 0 };
}

export function StatusChip({ stats }) {
  if (stats.total && stats.done === stats.total) return <span className="chip solid-blue"><Ic.Check size={12} /> 검토 완료</span>;
  if (stats.check) return <span className="chip amber"><span className="dot" />확인 필요 {stats.check}</span>;
  if (stats.done) return <span className="chip green"><span className="dot" />검토 중</span>;
  return <span className="chip gray"><span className="dot" />검토 전</span>;
}

export default function Home({ projects, onOpen, onNew, onSample, onDelete }) {
  return (
    <div className="content">
      <div className="crumb">내 스페이스</div>
      <div className="page-title">
        <span className="sq" style={{ background: '#7a5af8' }} />
        <h1>내 시험지</h1>
        <div className="acts">
          <button className="btn" onClick={onSample}>예제로 둘러보기</button>
          <button className="btn primary" onClick={onNew}>
            <Ic.Plus size={15} /> 새 변환
          </button>
        </div>
      </div>

      {!projects.length ? (
        <>
          <div className="hero">
            <div className="hero-card">
              <h3>시험지를 올리면, 원하는 학교 양식의 한글 파일로.</h3>
              <p>
                PDF·스캔본·손글씨 원안·hwpx·텍스트를 올리거나 붙여 넣으세요. 문항·지문·선지·&lt;보기&gt;·밑줄·수식을 나눠 읽고,
                고른 양식(원묵고 정기고사, 수능형, 또는 직접 올린 hwpx)으로 다시 조판해 <b>hwpx</b> 와 <b>PDF</b> 로 내려받습니다.
              </p>
              <div className="steps">
                <span className="step"><b>1</b>올리기</span>
                <span className="step"><b>2</b>문항 검토</span>
                <span className="step"><b>3</b>양식 고르기</span>
                <span className="step"><b>4</b>hwpx · PDF</span>
              </div>
            </div>
            <div className="hero-card">
              <h3>이 컴퓨터 안에서만 동작합니다</h3>
              <p>
                인터넷 없이도 변환·편집·hwpx·PDF 만들기가 모두 됩니다. 올린 파일과 결과는 이 컴퓨터에만 저장되고 밖으로 나가지 않습니다.
                단 하나의 예외는 스캔본·손글씨 <b>AI 인식</b> — 선생님이 직접 켜고 본인의 <b>무료 Gemini 키</b>를 넣었을 때만 해당 쪽 이미지를 Google 로 보냅니다.
              </p>
            </div>
          </div>
          <div className="empty">
            <Ic.Upload size={34} />
            <h2>첫 시험지를 변환해 보세요</h2>
            <p>회원가입도, 페이지 제한도 없습니다.</p>
            <div className="formats">
              {['PDF', '스캔·손글씨', 'HWPX', 'TXT', 'MD', 'JSON', '이미지', '붙여넣기'].map((f) => (
                <span key={f} className="chip gray">{f}</span>
              ))}
            </div>
            <button className="btn primary" onClick={onNew}><Ic.Plus size={15} /> 새 변환</button>{' '}
            <button className="btn" onClick={onSample}>예제로 둘러보기</button>
          </div>
        </>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>시험지 이름</th>
              <th>양식</th>
              <th>문항</th>
              <th>검토 진척</th>
              <th>만든 날</th>
              <th>고친 날</th>
              <th>상태</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => {
              const s = reviewStats(p.doc);
              const tpl = BUILTIN.find((t) => t.id === p.templateId);
              return (
                <tr key={p.id} className="row" onClick={() => onOpen(p.id)}>
                  <td>
                    <span className="name">
                      <span className="sq" style={{ background: p.color }} />
                      <span className="ellipsis">{p.title}</span>
                    </span>
                  </td>
                  <td className="muted">{tpl?.name ?? '직접 올린 양식'}</td>
                  <td className="num">{s.questions}</td>
                  <td>
                    <span className="progress"><i style={{ width: `${s.pct}%` }} /></span>
                    <span className="pct">{s.pct}%</span>
                  </td>
                  <td className="muted">{fmt(p.createdAt)}</td>
                  <td className="muted">{fmt(p.updatedAt)}</td>
                  <td><StatusChip stats={s} /></td>
                  <td style={{ width: 40 }}>
                    <button
                      className="icon-btn row-acts"
                      title="삭제"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`'${p.title}' 을(를) 삭제할까요? 이 컴퓨터에서 지워지며 되돌릴 수 없습니다.`)) onDelete(p.id);
                      }}
                    >
                      <Ic.Trash size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
