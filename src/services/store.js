// 모든 자료는 이 브라우저의 IndexedDB 에만 저장한다 (서버 없음)
const DB = 'auto-typer';
const VER = 1;

let dbp = null;
function db() {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('pages')) d.createObjectStore('pages', { keyPath: 'id' }); // 원본 쪽 이미지
      if (!d.objectStoreNames.contains('templates')) d.createObjectStore('templates', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('저장소 작업이 중단되었습니다 (저장 공간 부족?)'));
  });
}

export const put = (store, v) => tx(store, 'readwrite', (s) => s.put(v));
export const get = (store, id) => tx(store, 'readonly', (s) => s.get(id));
export const del = (store, id) => tx(store, 'readwrite', (s) => s.delete(id));
export const all = (store) => tx(store, 'readonly', (s) => s.getAll());

// ── 설정 (가벼운 값은 localStorage) ──
const SKEY = 'auto-typer/settings/v1';
// 모델 기본값은 늘 최신 Flash 를 가리키는 별칭 (gemini.js 의 DEFAULT_MODEL 과 같게)
const LATEST_MODEL = 'gemini-flash-latest';
const MODEL_VER = 2; // 2: 기본 모델을 'gemini-flash-latest' 로 — 예전에 특정 버전으로 고정된 설정은 한 번 바꿔 준다

export function loadSettings() {
  const base = { apiKey: '', model: LATEST_MODEL, handwriting: 'include', engine: 'auto', modelVer: MODEL_VER };
  try {
    const saved = JSON.parse(localStorage.getItem(SKEY) || '{}');
    const s = { ...base, ...saved };
    if ((saved.modelVer ?? 0) < MODEL_VER || !s.model) {
      s.model = LATEST_MODEL;
      s.modelVer = MODEL_VER;
      saveSettings(s);
    }
    return s;
  } catch {
    return base;
  }
}
export function saveSettings(s) {
  try {
    localStorage.setItem(SKEY, JSON.stringify(s));
  } catch {
    /* 사생활 보호 모드 등 */
  }
}
