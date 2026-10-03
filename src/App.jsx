import { useCallback, useEffect, useState } from 'react';
import * as Ic from './ui/icons.jsx';
import Home from './ui/Home.jsx';
import NewJob from './ui/NewJob.jsx';
import Project from './ui/Project.jsx';
import Templates from './ui/Templates.jsx';
import Settings from './ui/Settings.jsx';
import { all, del, get, put, loadSettings, saveSettings } from './services/store.js';
import { sampleDoc } from './sampleDoc.js';

const COLORS = ['#7a5af8', '#1f6fff', '#12b76a', '#f79009', '#e5484d', '#0ea5a4', '#d444f1'];

export default function App() {
  const [view, setView] = useState({ name: 'home' });
  const [projects, setProjects] = useState([]);
  const [settings, setSettingsState] = useState(loadSettings);
  const [toast, setToast] = useState(null);

  const refresh = useCallback(async () => {
    const list = await all('projects');
    list.sort((a, b) => b.updatedAt - a.updatedAt);
    setProjects(list);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const notify = useCallback((msg, kind = '') => {
    setToast({ msg, kind });
    clearTimeout(notify.t);
    notify.t = setTimeout(() => setToast(null), kind === 'err' ? 6000 : 2600);
  }, []);

  const setSettings = (s) => {
    setSettingsState(s);
    saveSettings(s);
  };

  const createProject = async ({ doc, pages = [], templateId, sourceName = '', engineUsed = 'rules' }) => {
    const id = `p${Date.now().toString(36)}`;
    const now = Date.now();
    const rec = {
      id,
      title: doc.title,
      color: COLORS[projects.length % COLORS.length],
      templateId,
      createdAt: now,
      updatedAt: now,
      doc: { ...doc, templateId },
      pageCount: pages.length,
      sourceName,
      engineUsed,
    };
    await put('projects', rec);
    if (pages.length) await put('pages', { id, pages });
    await refresh();
    setView({ name: 'project', id });
  };

  const saveProject = async (rec) => {
    const next = { ...rec, title: rec.doc.title, updatedAt: Date.now() };
    await put('projects', next);
    setProjects((ps) => ps.map((p) => (p.id === next.id ? next : p)));
    return next;
  };

  const removeProject = async (id) => {
    await del('projects', id);
    await del('pages', id);
    await refresh();
    if (view.id === id) setView({ name: 'home' });
  };

  const openSample = async () => {
    await createProject({ doc: sampleDoc(), templateId: 'wonmook', sourceName: '예제' });
  };

  const nav = [
    { key: 'home', label: '내 작업', icon: Ic.Home },
    { key: 'templates', label: '양식', icon: Ic.Layout },
    { key: 'settings', label: '설정', icon: Ic.Gear },
  ];
  const active = view.name === 'project' || view.name === 'new' ? 'home' : view.name;

  return (
    <div className="app">
      <header className="masthead">
        <span className="streak a" />
        <span className="streak b" />
        <div className="mh-left">
          <div className="mh-row">
            <svg className="mh-logo" viewBox="0 0 56 56" aria-hidden="true">
              <path d="M28 4 52 28 28 52 4 28Z" fill="#fff" />
              <path d="M19 22h18M19 28h18M19 34h12" stroke="#0b86f3" strokeWidth="3.2" strokeLinecap="round" fill="none" />
            </svg>
            <h1>Auto-typer</h1>
            <span className="mh-badge">에듀테크 표준 양식</span>
          </div>
          <p>스캔본·사진·손글씨·PDF 학습자료를 원하는 학교 양식의 HWPX·PDF로 즉시 변환</p>
        </div>
        <div className="mh-right">
          {!settings.apiKey && (
            <button className="mh-key" onClick={() => setView({ name: 'settings' })} title="손글씨·스캔본 AI 인식 켜기">
              <Ic.Key size={18} /> <span>AI 인식 켜기</span>
            </button>
          )}
          <button className="mh-btn" aria-label="설정" title="설정" onClick={() => setView({ name: 'settings' })}>
            <Ic.Gear size={28} />
          </button>
        </div>
      </header>

      <nav className="rail" aria-label="주 메뉴">
        <button className="plus" title="새 변환" aria-label="새 변환" onClick={() => setView({ name: 'new' })}>
          <Ic.Plus size={26} />
        </button>
        {nav.map((n) => (
          <button key={n.key} className={`rail-item ${active === n.key ? 'on' : ''}`} onClick={() => setView({ name: n.key })}>
            <n.icon size={26} />
            {n.label}
          </button>
        ))}
        <div className="grow" />
      </nav>

      <main className="main">
        {view.name === 'home' && (
          <Home projects={projects} onOpen={(id) => setView({ name: 'project', id })} onNew={() => setView({ name: 'new' })} onSample={openSample} onDelete={removeProject} />
        )}
        {view.name === 'new' && (
          <NewJob settings={settings} onCancel={() => setView({ name: 'home' })} onDone={createProject} onSettings={() => setView({ name: 'settings' })} notify={notify} />
        )}
        {view.name === 'project' && (
          <ProjectLoader id={view.id} projects={projects} onSave={saveProject} onBack={() => setView({ name: 'home' })} notify={notify} settings={settings} />
        )}
        {view.name === 'templates' && <Templates notify={notify} />}
        {view.name === 'settings' && <Settings settings={settings} setSettings={setSettings} notify={notify} tab={view.tab} />}
      </main>

      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
    </div>
  );
}

function ProjectLoader({ id, projects, ...rest }) {
  const rec = projects.find((p) => p.id === id);
  const [pages, setPages] = useState(null);
  useEffect(() => {
    let alive = true;
    get('pages', id).then((r) => alive && setPages(r?.pages ?? []));
    return () => {
      alive = false;
    };
  }, [id]);
  if (!rec || !pages) return <div className="content"><div className="loading"><span className="spin" /> 불러오는 중</div></div>;
  return <Project key={id} record={rec} pages={pages} {...rest} />;
}
