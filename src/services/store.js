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
export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SKEY) || '{}');
    const hw = raw.handwriting === 'ignore' ? 'ignore' : (raw.handwritingVersion >= 2 && raw.handwriting === 'include' ? 'include' : 'auto');
    const migrated = {
      apiKey: '',
      model: '',
      imageModel: 'gemini-3.1-flash-lite-image',
      engine: 'auto',
      ...raw,
      handwriting: hw,
      handwritingVersion: 2,
      imageModel: raw.imageModel || 'gemini-3.1-flash-lite-image',
    };
    if (raw.handwriting !== hw || raw.handwritingVersion !== 2) {
      saveSettings(migrated);
    }
    return migrated;
  } catch {
    return { apiKey: '', model: '', imageModel: 'gemini-3.1-flash-lite-image', handwriting: 'auto', engine: 'auto', handwritingVersion: 2 };
  }
}
export function saveSettings(s) {
  try {
    localStorage.setItem(SKEY, JSON.stringify({ ...s, handwritingVersion: 2 }));
  } catch {
    /* 사생활 보호 모드 등 */
  }
}
