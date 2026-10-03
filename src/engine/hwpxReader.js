// 입력용: 아무 hwpx 문서 → 내부 표기 텍스트 (밑줄·굵게 보존, 표 속 글은 문단으로 펼침)
import { loadHwpx, readText, tText } from './hwpx.js';

export function hwpxToText(bytes) {
  const pkg = loadHwpx(bytes);
  const header = readText(pkg, 'Contents/header.xml');
  const deco = {};
  for (const m of header.matchAll(/<hh:charPr id="(\d+)"[\s\S]*?<\/hh:charPr>/g)) {
    deco[m[1]] = {
      u: /<hh:underline type="(BOTTOM|CENTER)"/.test(m[0]),
      b: /<hh:bold\/>/.test(m[0]),
    };
  }
  // 자동 번호 문단(문단 번호 매기기) → 번호를 글자로 풀어 준다
  const autoNum = {};
  for (const m of header.matchAll(/<hh:paraPr id="(\d+)"[\s\S]*?<\/hh:paraPr>/g)) {
    const h = /<hh:heading type="(NUMBER|OUTLINE)" idRef="(\d+)" level="(\d+)"/.exec(m[0]);
    if (h && h[3] === '0') autoNum[m[1]] = h[2];
  }
  const counters = {};
  const sections = Object.keys(pkg.files)
    .filter((k) => /^Contents\/section\d+\.xml$/.test(k))
    .sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);

  const out = [];
  for (const name of sections) {
    const xml = readText(pkg, name);
    // 모든 문단(표 안 포함)을 문서 순서대로: 문단 시작 태그 기준으로 자른다
    const clean = xml.replace(/<hp:(header|footer)\b[\s\S]*?<\/hp:\1>/g, '');
    for (const pm of clean.matchAll(/<hp:p\b([^>]*)>([\s\S]*?)(?=<hp:p\b|<\/hp:subList>|<\/hs:sec>)/g)) {
      const pp = /paraPrIDRef="(\d+)"/.exec(pm[1])?.[1];
      let line = '';
      for (const rm of pm[2].matchAll(/<hp:run charPrIDRef="(\d+)"[^>]*>([\s\S]*?)(?=<hp:run\b|<\/hp:p>|$)/g)) {
        const d = deco[rm[1]] || {};
        const eqs = [...rm[2].matchAll(/<hp:script>([\s\S]*?)<\/hp:script>/g)].map((x) => `$${tText(x[1])}$`);
        const t = [...rm[2].matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)].map((x) => tText(x[1])).join('');
        let seg = eqs.join(' ') + t;
        if (seg.trim()) {
          if (d.b) seg = `**${seg}**`;
          if (d.u) seg = seg.replace(/^(\s*)(.*?)(\s*)$/, (_, a, b, c) => (b ? `${a}__${b}__${c}` : _));
        }
        line += seg;
      }
      line = line.replace(/\*\*\*\*/g, '').replace(/____/g, '');
      if (pp in autoNum && line.trim()) {
        counters[autoNum[pp]] = (counters[autoNum[pp]] ?? 0) + 1;
        line = `${counters[autoNum[pp]]}. ${line}`;
      }
      out.push(line);
    }
    out.push('');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}
