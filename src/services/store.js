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
    const hw = raw.handwritingVersion >= 3 && (raw.handwriting === 'include' || raw.handwriting === 'ignore') ? raw.handwriting : 'auto';
    // 이미지 생성 모델(유료 전용)은 더 쓰지 않는다: 예전 설정의 imageModel 은 지우고,
    // 글 모델 칸에 이미지 모델이 들어 있었다면 기본 모델(무료 Flash)로 되돌린다
    const { imageModel, ...rest } = raw;
    const paidModel = /image|imagen/i.test(rest.model || '');
    const migrated = {
      apiKey: '',
      model: '',
      engine: 'auto',
      mdAction: 'ask',
      ...rest,
      ...(paidModel ? { model: '' } : {}),
      handwriting: hw,
      handwritingVersion: 3,
    };
    if (raw.handwriting !== hw || raw.handwritingVersion !== 3 || imageModel !== undefined || paidModel) {
      saveSettings(migrated);
    }
    return migrated;
  } catch {
    return { apiKey: '', model: '', handwriting: 'auto', engine: 'auto', mdAction: 'ask', handwritingVersion: 3 };
  }
}
export function saveSettings(s) {
  try {
    localStorage.setItem(SKEY, JSON.stringify({ ...s, handwritingVersion: 3 }));
  } catch {
    /* 사생활 보호 모드 등 */
  }
}
