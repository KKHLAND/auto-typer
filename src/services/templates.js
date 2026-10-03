// 양식 목록: 내장(원묵고·수능) + 선생님이 올린 양식
import { loadHwpx, stripToTemplate, collectHeaderTexts, savePackage } from '../engine/hwpx.js';
import { all, put, del } from './store.js';

export const BUILTIN = [
  {
    id: 'wonmook',
    name: '표준 2단 학습지 / 시험지 (샘플)',
    desc: 'A4 · 2단 분할 · 학교 머리표 · 자동 쪽번호 (원묵고 서식 기반)',
    paper: 'A4',
    theme: 'wonmook',
    color: '#2f6bff',
    // 머리 문구에 붙일 친절한 이름 (순서대로)
    labels: ['학년도·학기', '시험명', '시험 날짜', '', '과목코드', '과목명', '바닥글(앞)', '바닥글(뒤)', '학년·과정', '선택형 안내', '단답형 안내', '시험지 면수', '확인 문구', '이어짐 안내(짝수쪽)', '이어짐 안내(홀수쪽)'],
  },
  {
    id: 'suneung',
    name: 'B4 대형 학습지 / 모의평가형 (샘플)',
    desc: 'B4 · 2단 · 영역·과목 머리말 (수능 서식 기반)',
    paper: 'B4',
    theme: 'suneung',
    color: '#111827',
    labels: ['시험명', '영역(첫 쪽)', '전체 쪽 수', '영역(짝수쪽 머리)', '영역(홀수쪽 머리)', '교시'],
  },
];

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
    if (!t) return loadTemplate('wonmook');
    const pkg = loadHwpx(t.bytes);
    entry = { meta: t.meta, pkg, analysis: t.analysis, headerTexts: collectHeaderTexts(pkg) };
  }
  // 머리 문구에 이름 붙이기
  entry.headerTexts = entry.headerTexts.map((h, i) => ({ ...h, label: entry.meta.labels?.[i] || '' }));
  cache.set(id, entry);
  return entry;
}

export async function listTemplates() {
  const custom = (await all('templates')).map((t) => t.meta);
  return [...BUILTIN, ...custom];
}

/** 선생님이 올린 hwpx 시험지 → 양식으로 등록 (본문을 학습한 뒤 걷어내 가볍게 보관) */
export async function addCustomTemplate(file) {
  const src = loadHwpx(new Uint8Array(await file.arrayBuffer()));
  const { bytes, analysis } = stripToTemplate(src);
  const g = analysis.geometry;
  const mm = (v) => Math.round(v / 283.465);
  const id = `custom-${Date.now().toString(36)}`;
  const meta = {
    id,
    name: file.name.replace(/\.hwpx$/i, ''),
    desc: `${mm(g.width)}×${mm(g.height)}mm · ${g.cols}단 · 직접 올린 양식`,
    paper: `${mm(g.width)}x${mm(g.height)}`,
    theme: 'generic',
    color: '#0ea5a4',
    custom: true,
    labels: [],
  };
  await put('templates', { id, meta, bytes, analysis, createdAt: Date.now() });
  return { meta, analysis };
}

export async function removeCustomTemplate(id) {
  cache.delete(id);
  await del('templates', id);
}

export { savePackage };
