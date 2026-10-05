import { useState } from 'react';
import * as Ic from './icons.jsx';
import { BUILTIN } from '../services/templates.js';

const fmt = (t) => {
  const d = new Date(t);
  return `${String(d.getFullYear()).slice(2)}. ${d.getMonth() + 1}. ${d.getDate()}.`;
};

export function reviewStats(doc) {
  const qs = doc.blocks || [];
  const done = qs.filter((i) => i.flag === 'done').length;
  const check = qs.filter((i) => i.flag === 'check').length;
  return { total: qs.length, done, check, pct: qs.length ? Math.round((done / qs.length) * 100) : 0 };
}

export function StatusChip({ stats }) {
  if (stats.total && stats.done === stats.total) return <span className="chip solid-blue"><Ic.Check size={12} /> 검토 완료</span>;
  if (stats.check) return <span className="chip amber"><span className="dot" />확인 필요 {stats.check}</span>;
  if (stats.done) return <span className="chip green"><span className="dot" />검토 중</span>;
  return <span className="chip gray"><span className="dot" />검토 전</span>;
}

export default function Home({
  mode = 'landing',
  projects = [],
  onOpen,
  onNew,
  onSample,
  onDelete,
  onViewProjects,
  onViewHome,
}) {
  const [deleteTarget, setDeleteTarget] = useState(null);

  const renderTable = (items) => (
    <table className="table">
      <thead>
        <tr>
          <th>학습자료 이름</th>
          <th>양식</th>
          <th>내용</th>
          <th>검토 진척</th>
          <th>만든 날</th>
          <th>고친 날</th>
          <th>상태</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {items.map((p) => {
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
              <td className="num">{s.total}</td>
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
                    setDeleteTarget({ id: p.id, title: p.title });
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
  );

  return (
    <div className="content">
      {mode === 'landing' ? (
        <>
          <div className="crumb">
            <span>홈</span> › <span>서비스 소개 및 시작</span>
          </div>
          <div className="page-title">
            <span className="sq" style={{ background: '#0b86f3' }} />
            <h1>홈 · Auto-typer 소개</h1>
            <div className="acts">
              {projects.length > 0 && (
                <button className="btn" onClick={onViewProjects}>
                  <Ic.List size={15} /> 내 작업 목록 ({projects.length})
                </button>
              )}
              <button className="btn" onClick={onSample}>예제로 둘러보기</button>
              <button className="btn primary" onClick={onNew}>
                <Ic.Plus size={15} /> 새 변환
              </button>
            </div>
          </div>

          <div className="hero">
            <div className="hero-card">
              <h3>학습자료를 올리면, 원하는 학교 양식의 한글 파일로.</h3>
              <p>
                수업 자료·학습지·판서 사진·손글씨 필기·PDF·hwpx·텍스트를 올리거나 붙여 넣으세요. 손글씨까지 빠르게 읽어
                내용은 고치지 않고 제목·문단·목록·상자·표로만 나눈 뒤, <b>원하는 양식</b>(우리 학교 hwpx, 또는 샘플 양식)에 그대로 담아 <b>hwpx</b> 와 <b>PDF</b> 로 만듭니다.
              </p>
              <div className="steps">
                <span className="step"><b>1</b>올리기</span>
                <span className="step"><b>2</b>내용 검토</span>
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
            <h2>{projects.length ? '새 학습자료 변환하기' : '첫 학습자료를 변환해 보세요'}</h2>
            <p>회원가입도, 페이지 제한도 없습니다. 파일을 올리거나 붙여넣으면 즉시 시작됩니다.</p>
            <div className="formats">
              {['PDF', '스캔·손글씨', 'HWP', 'HWPX', 'DOCX', 'XLSX', 'TXT', 'MD', 'JSON', '이미지', '붙여넣기'].map((f) => (
                <span key={f} className="chip gray">{f}</span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn primary" onClick={onNew}><Ic.Plus size={15} /> 새 변환 시작</button>
              <button className="btn" onClick={onSample}>예제로 둘러보기</button>
              {projects.length > 0 && (
                <button className="btn" onClick={onViewProjects}>
                  <Ic.List size={15} /> 이전 작업한 학습자료 ({projects.length}) 보기
                </button>
              )}
            </div>
          </div>

          {projects.length > 0 && (
            <div className="recent-section" style={{ marginTop: 36 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="sq" style={{ background: '#7a5af8', width: 12, height: 12, borderRadius: 3 }} />
                  최근 작업한 학습자료 ({projects.length}개)
                </h3>
                <button className="btn sm" onClick={onViewProjects} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  내 작업 전체보기 ({projects.length}개) →
                </button>
              </div>
              {renderTable(projects.slice(0, 5))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="crumb">
            <button onClick={onViewHome}>홈</button> › <span>내 작업</span>
          </div>
          <div className="page-title">
            <span className="sq" style={{ background: '#7a5af8' }} />
            <h1>내 학습자료 ({projects.length})</h1>
            <div className="acts">
              <button className="btn" onClick={onViewHome} title="처음 랜딩 페이지 보기">
                <Ic.Home size={15} /> 홈 소개 보기
              </button>
              <button className="btn" onClick={onSample}>예제로 둘러보기</button>
              <button className="btn primary" onClick={onNew}>
                <Ic.Plus size={15} /> 새 변환
              </button>
            </div>
          </div>

          {!projects.length ? (
            <div className="empty">
              <Ic.Upload size={34} />
              <h2>아직 변환한 학습자료가 없습니다</h2>
              <p>새 파일을 변환하거나 예제를 불러와 시작해 보세요.</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="btn primary" onClick={onNew}><Ic.Plus size={15} /> 새 변환</button>
                <button className="btn" onClick={onSample}>예제로 둘러보기</button>
                <button className="btn" onClick={onViewHome}><Ic.Home size={15} /> 홈 소개 보기</button>
              </div>
            </div>
          ) : (
            renderTable(projects)
          )}
        </>
      )}

      {deleteTarget && (
        <div className="modal-bg" onClick={() => setDeleteTarget(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">
              <span>학습자료 삭제</span>
              <span className="grow" />
              <button className="icon-btn" onClick={() => setDeleteTarget(null)} title="닫기">
                <Ic.Close size={16} />
              </button>
            </div>
            <div className="modal-b" style={{ fontSize: 14.5, color: 'var(--ink-2)', lineHeight: 1.6, padding: '12px 18px 20px' }}>
              ‘<b>{deleteTarget.title}</b>’ 을(를) 삭제할까요?<br />
              이 컴퓨터에서 지워지며 되돌릴 수 없습니다.
            </div>
            <div className="modal-f">
              <button className="btn" onClick={() => setDeleteTarget(null)}>취소</button>
              <button
                className="btn danger"
                style={{ background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }}
                onClick={() => {
                  onDelete(deleteTarget.id);
                  setDeleteTarget(null);
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
