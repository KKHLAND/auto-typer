// 양식 목록: 내장 샘플(A4 2단) + 선생님이 올린 양식
import { loadHwpx, stripToTemplate, collectHeaderTexts, savePackage } from '../engine/hwpx.js';
import { detectSlots, formOutline } from '../engine/form.js';
import { all, get, put, del } from './store.js';

export const BUILTIN = [
  {
    id: 'sample',
    name: '2단 학습지 (샘플, A4)',
    desc: 'A4 · 2단 · 머리: 학교명 | 학습 자료명 | 학번·이름 (수능 2단 서식 기반)',
    paper: 'A4',
    theme: 'sample',
    color: '#1f6fff',
    // 머리 문구 이름 (양식 속 순서대로)
    labels: ['쪽 번호 앞', '쪽 번호 뒤', '학교명', '학습 자료명', '학번·이름'],
    // 이 칸은 따로 고치지 않으면 학습자료 이름이 들어간다
    titleIndex: 3,
  },
];

/** 예전 내장 양식(원묵고·수능) 으로 만든 작업은 새 샘플 양식으로 연다 */
export const LEGACY_IDS = ['wonmook', 'suneung'];

const cache = new Map();

/** {meta, pkg, analysis, headerTexts} */
export async function loadTemplate(id) {
  if (cache.has(id)) return cache.get(id);
  let entry;
  const b = BUILTIN.find((t) => t.id === id);
  if (b) {
    const base = import.meta.env.BASE_URL;
    const [bytes, analysis] = await Promise.all([
      fetch(`${base}templates/${id}.hwpx`).then((r) => r.arrayBuffer()),
      fetch(`${base}templates/${id}.profile.json`).then((r) => r.json()),
    ]);
    const pkg = loadHwpx(new Uint8Array(bytes));
    entry = { meta: b, pkg, analysis, headerTexts: collectHeaderTexts(pkg) };
  } else {
    const t = (await all('templates')).find((x) => x.id === id);
    if (!t) return loadTemplate('sample');
    const pkg = loadHwpx(t.bytes);
    entry = { meta: t.meta, pkg, analysis: t.analysis, headerTexts: collectHeaderTexts(pkg) };
    // 채움 양식: 올린 양식 원본 그대로 + 채울 칸
    if (t.formBytes && t.slots?.length) {
      const fpkg = loadHwpx(t.formBytes);
      entry.form = { pkg: fpkg, slots: t.slots, outline: formOutline(fpkg, t.slots.filter((x) => !x.off)) };
    }
  }
  // 머리 문구에 이름 붙이기
  entry.headerTexts = entry.headerTexts.map((h, i) => ({ ...h, label: entry.meta.labels?.[i] || (h.field ? `${h.field} (필드)` : '') }));
  cache.set(id, entry);
  return entry;
}

export async function listTemplates() {
  const custom = (await all('templates')).map((t) => t.meta);
  return [...BUILTIN, ...custom];
}

/** 선생님이 올린 hwpx 시험지 → 양식으로 등록 (본문을 학습한 뒤 걷어내 가볍게 보관) */
export async function addCustomTemplate(file) {
  const formBytes = new Uint8Array(await file.arrayBuffer());
  // 빈 칸(학번·이름·답 칸·답 줄·누름틀)을 찾는다 — 있으면 '채움 양식'으로도 쓸 수 있다
  let slots = [];
  try {
    slots = detectSlots(loadHwpx(formBytes));
  } catch (e) {
    console.warn('칸 찾기 실패', e);
  }
  const { bytes, analysis } = stripToTemplate(loadHwpx(formBytes));
  const g = analysis.geometry;
  const mm = (v) => Math.round(v / 283.465);
  const id = `custom-${Date.now().toString(36)}`;
  const meta = {
    id,
    name: file.name.replace(/\.hwpx$/i, ''),
    desc: slots.length
      ? `채움 양식 · 칸 ${slots.length}개 · ${mm(g.width)}×${mm(g.height)}mm`
      : `${mm(g.width)}×${mm(g.height)}mm · ${g.cols}단 · 직접 올린 양식`,
    fill: slots.length > 0,
    paper: `${mm(g.width)}x${mm(g.height)}`,
    theme: 'generic',
    color: '#0ea5a4',
    custom: true,
    labels: [],
  };
  await put('templates', { id, meta, bytes, analysis, createdAt: Date.now(), ...(slots.length ? { formBytes, slots } : {}) });
  return { meta, analysis, slots };
}

/** 채움 양식의 칸 이름·켜고 끄기 저장 */
export async function saveTemplateSlots(id, slots) {
  const t = await get('templates', id);
  if (!t) return;
  await put('templates', { ...t, slots });
  cache.delete(id);
}

export async function removeCustomTemplate(id) {
  cache.delete(id);
  await del('templates', id);
}

export { savePackage };
