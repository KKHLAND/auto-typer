// 양식 목록: 내장 샘플(A4 2단) + 선생님이 올린 양식
import { loadHwpx, stripToTemplate, collectHeaderTexts, savePackage } from '../engine/hwpx.js';
import { detectSlots, formOutline, bodyTextLength } from '../engine/form.js';
import { all, get, put, del } from './store.js';

export const BUILTIN = [
  {
    id: 'sample',
    name: '기본 양식1 · 2단 학습지 (A4)',
    desc: 'A4 · 2단 · 머리: 학교명 | 학습 자료명 (수능 2단 서식 기반)',
    paper: 'A4',
    theme: 'sample',
    color: '#1f6fff',
    // 머리 문구 이름 (양식 속 순서대로)
    labels: ['쪽 번호 앞', '쪽 번호 뒤', '학교명', '학습 자료명'],
    // 이 칸은 따로 고치지 않으면 학습자료 이름이 들어간다
    titleIndex: 3,
  },
  {
    id: 'plain',
    name: '기본 양식2 · 1단 학습지 (A4)',
    desc: 'A4 · 1단 · 머리: 학교명 | 학습 자료명 (기본 양식1을 1단으로)',
    paper: 'A4',
    theme: 'plain', // 미리보기는 기본 양식1과 같은 머리 표·쪽 번호
    color: '#12b76a',
    labels: ['쪽 번호 앞', '쪽 번호 뒤', '학교명', '학습 자료명'],
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
    // '양식 그대로' 이면 올린 원본 전체에 내용을 넣고, 아니면 본문을 걷어 낸 가벼운 양식(서식만)을 쓴다
    const keep = t.meta.keep && t.formBytes;
    const pkg = loadHwpx(keep ? t.formBytes : t.bytes);
    entry = { meta: t.meta, pkg, analysis: t.analysis, headerTexts: collectHeaderTexts(pkg), keepBody: !!keep };
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

/** 고를 수 있는 양식: 기본 양식1(2단)·기본 양식2(1단) 두 가지 (예전에 올린 양식은 그 양식으로 만든 작업에서만 연다) */
export async function listTemplates() {
  return BUILTIN;
}

/** 선생님이 올린 hwpx → 양식으로 등록 */
export async function addCustomTemplate(file) {
  return addTemplateBytes(new Uint8Array(await file.arrayBuffer()), file.name.replace(/\.hwpx$/i, ''));
}

/**
 * hwpx 바이트 → 양식 등록. 원본은 그대로 보관하고(양식 그대로 쓰기·채움 양식), 서식 학습용 가벼운 사본도 만든다.
 * 본문 글이 적으면(빈 양식) '양식 그대로', 글이 많으면(내용이 든 문서) '서식만' 을 기본으로 한다.
 */
export async function addTemplateBytes(formBytes, name, extra = {}, prebuilt = null) {
  // 빈 칸(학번·이름·답 칸·답 줄·누름틀)을 찾는다 — 있으면 '채움 양식'으로도 쓸 수 있다 (만든 양식은 제외)
  let slots = [];
  if (!prebuilt) {
    try {
      slots = detectSlots(loadHwpx(formBytes));
    } catch (e) {
      console.warn('칸 찾기 실패', e);
    }
  }
  // prebuilt = 앱이 지은 양식(원본 모양 따라 만들기) — 서식을 이미 알고 있다
  const { bytes, analysis } = prebuilt ?? stripToTemplate(loadHwpx(formBytes));
  const g = analysis.geometry;
  const mm = (v) => Math.round(v / 283.465);
  const id = `custom-${Date.now().toString(36)}`;
  let keep = true;
  try {
    keep = bodyTextLength(new TextDecoder().decode(loadHwpx(formBytes).files['Contents/section0.xml'])) < 1500;
  } catch {
    /* 못 재면 그대로 두기 */
  }
  const meta = {
    id,
    name,
    desc: `${mm(g.width)}×${mm(g.height)}mm · ${g.cols}단 · 직접 올린 양식`,
    fill: slots.length > 0,
    keep,
    ...extra,
    paper: `${mm(g.width)}x${mm(g.height)}`,
    theme: 'generic',
    color: '#0ea5a4',
    custom: true,
    labels: [],
  };
  await put('templates', { id, meta, bytes, analysis, createdAt: Date.now(), formBytes, slots });
  return { meta, analysis, slots };
}

/** 양식 쓰는 방식: true = 올린 양식 그대로 두고 내용 넣기, false = 서식만 빌려 정리 */
export async function setTemplateKeep(id, keep) {
  const t = await get('templates', id);
  if (!t) return;
  await put('templates', { ...t, meta: { ...t.meta, keep } });
  cache.delete(id);
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
