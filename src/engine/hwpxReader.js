// 입력용: 아무 hwpx 문서 → 내부 표기 텍스트
//  - 문단은 빈 줄로 구분, 밑줄·굵게·수식은 표기로 보존
//  - 본문보다 큰 글씨의 짧은 문단은 소제목(#), 자동 번호는 글자로 풀어 줌
//  - 표는 마크다운 표로, 1칸짜리 표(상자)는 인용(>)으로
import { loadHwpx, readText, tText } from './hwpx.js';

export function hwpxToText(bytes) {
  const pkg = loadHwpx(bytes);
  const header = readText(pkg, 'Contents/header.xml');
  const deco = {};
  for (const m of header.matchAll(/<hh:charPr id="(\d+)"[\s\S]*?<\/hh:charPr>/g)) {
    deco[m[1]] = {
      u: /<hh:underline type="(BOTTOM|CENTER)"/.test(m[0]),
      b: /<hh:bold\/>/.test(m[0]),
      h: +(/ height="(\d+)"/.exec(m[0])?.[1] ?? 1000),
    };
  }
  const autoNum = {};
  for (const m of header.matchAll(/<hh:paraPr id="(\d+)"[\s\S]*?<\/hh:paraPr>/g)) {
    const h = /<hh:heading type="(NUMBER|OUTLINE)" idRef="(\d+)" level="(\d+)"/.exec(m[0]);
    if (h && h[3] === '0') autoNum[m[1]] = h[2];
  }
  const counters = {};
  const sections = Object.keys(pkg.files)
    .filter((k) => /^Contents\/section\d+\.xml$/.test(k))
    .sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);

  /** 문단 하나 → {text, h(가장 많이 쓴 글자 크기)} */
  const paraText = (attrs, inner) => {
    const pp = /paraPrIDRef="(\d+)"/.exec(attrs)?.[1];
    let line = '';
    const sizes = new Map();
    for (const rm of inner.matchAll(/<hp:run charPrIDRef="(\d+)"[^>]*>([\s\S]*?)(?=<hp:run\b|<\/hp:p>|$)/g)) {
      const d = deco[rm[1]] || { h: 1000 };
      const eqs = [...rm[2].matchAll(/<hp:script>([\s\S]*?)<\/hp:script>/g)].map((x) => `$${tText(x[1])}$`);
      const t = [...rm[2].matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)].map((x) => tText(x[1])).join('');
      let seg = eqs.join(' ') + t;
      if (seg.trim()) {
        sizes.set(d.h, (sizes.get(d.h) ?? 0) + seg.length);
        if (d.b) seg = `**${seg}**`;
        if (d.u) seg = seg.replace(/^(\s*)(.*?)(\s*)$/, (all, a, b, c) => (b ? `${a}__${b}__${c}` : all));
      }
      line += seg;
    }
    line = line.replace(/\*\*\*\*/g, '').replace(/____/g, '');
    if (pp in autoNum && line.trim()) {
      counters[autoNum[pp]] = (counters[autoNum[pp]] ?? 0) + 1;
      line = `${counters[autoNum[pp]]}. ${line}`;
    }
    const h = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 1000;
    return { text: line, h };
  };

  const items = []; // {text, h} | {table: rows} | {box: lines}
  for (const name of sections) {
    let xml = readText(pkg, name).replace(/<hp:(header|footer)\b[\s\S]*?<\/hp:\1>/g, '');
    // 표를 먼저 떼어 내 자리표시로 바꾼다 (안쪽 표부터)
    const tables = [];
    let guard = 0;
    while (/<hp:tbl\b/.test(xml) && guard++ < 500) {
      xml = xml.replace(/<hp:tbl\b[^>]*>((?:(?!<hp:tbl\b)[\s\S])*?)<\/hp:tbl>/, (_, body) => {
        const rows = [...body.matchAll(/<hp:tr>([\s\S]*?)<\/hp:tr>/g)].map((tr) =>
          [...tr[1].matchAll(/<hp:tc\b[\s\S]*?<\/hp:tc>/g)].map((tc) =>
            [...tc[0].matchAll(/<hp:p\b([^>]*)>([\s\S]*?)<\/hp:p>/g)]
              .map((p) => paraText(p[1], p[2]).text)
              .concat([...tc[0].matchAll(/⟦TBL(\d+)⟧/g)].map((x) => tables[+x[1]]?.flat().join(' ') ?? ''))
              .filter((s) => s.trim() && !/^⟦TBL\d+⟧$/.test(s.trim()))
              .join('\n'),
          ),
        );
        tables.push(rows);
        return `<hp:t>⟦TBL${tables.length - 1}⟧</hp:t>`;
      });
    }
    for (const pm of xml.matchAll(/<hp:p\b([^>]*)>([\s\S]*?)(?=<hp:p\b|<\/hp:subList>|<\/hs:sec>)/g)) {
      const { text, h } = paraText(pm[1], pm[2]);
      const parts = text.split(/(⟦TBL\d+⟧)/);
      for (const part of parts) {
        const tm = /^⟦TBL(\d+)⟧$/.exec(part);
        if (tm) {
          const rows = tables[+tm[1]];
          if (!rows?.length) continue;
          if (rows.length === 1 && rows[0].length === 1) items.push({ box: rows[0][0].split('\n') });
          else items.push({ table: rows });
        } else if (part.trim()) items.push({ text: part.trim(), h });
      }
    }
  }

  // 본문 글자 크기 = 글자 수로 가중한 최빈값
  const w = new Map();
  for (const it of items) if (it.text) w.set(it.h, (w.get(it.h) ?? 0) + it.text.length);
  const bodyH = [...w.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 1000;
  const bigger = [...new Set(items.filter((it) => it.text && it.h >= bodyH * 1.15 && it.text.length <= 60).map((it) => it.h))].sort((a, b) => b - a);

  const out = [];
  for (const it of items) {
    if (it.table) {
      out.push(it.table.map((r) => `| ${r.map((c) => c.replace(/\n/g, ' ').replace(/\|/g, '｜')).join(' | ')} |`).join('\n'));
    } else if (it.box) {
      out.push(it.box.map((l) => `> ${l}`).join('\n'));
    } else {
      const lv = it.text.length <= 60 ? bigger.indexOf(it.h) : -1;
      out.push(lv >= 0 && lv < 3 ? `${'#'.repeat(lv + 1)} ${it.text.replace(/^\*\*(.*)\*\*$/, '$1')}` : it.text);
    }
  }
  return out.join('\n\n');
}
