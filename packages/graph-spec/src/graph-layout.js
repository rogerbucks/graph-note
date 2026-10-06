/*
The Graphviz layout source for a graph, in plain JavaScript — byte-identical to what graph_svg.py writes (python/graph_spec), so a
drawing made in the editor and one made by the Python drawing script are laid out from the same text (spec §12).

Usage:
  In a page:  <script src="graph-layout.js"></script>  then  GraphLayout.dotSource(nodes, edges, 'LR', style)
  In Node:    require('@graph-note/graph-spec/src/graph-layout.js')

Writes: nothing (library).

nodes: [[key, kind, text]]; edges: [[source key, reading, target key]]; style: the locked style, graph_svg.style.json.
Returns [source, kinds, readings], as dot_source does. The parts Python lends it — textwrap, zlib.crc32, html.escape and
round — are ported here exactly, each proved against Python by the layout tests. Nothing Node-specific.
*/
(function (root) {
  'use strict';

  // ── the parts Python lends the layout ────────────────────────────────────────────────────────
  /** Python's round(): the nearest whole number, halves to the even one. */
  function roundHalfEven(x) {
    const f = Math.floor(x), d = x - f;
    const r = d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1);
    return r === 0 ? 0 : r;   // never -0
  }

  /** Python's html.escape(s), quote=True. */
  const escape = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

  /** zlib.crc32 of the UTF-8 bytes of a string, unsigned. */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(s) {
    let c = 0xffffffff;
    for (const b of new TextEncoder().encode(s)) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /** Python's textwrap.wrap(text, width, break_on_hyphens=False), with its other defaults. Lengths count code points, as Python does. */
  function wrap(text, width) {
    const len = s => [...s].length;
    const cut = (s, n) => { const cs = [...s]; return [cs.slice(0, n).join(''), cs.slice(n).join('')]; };
    // expand_tabs (tab size 8), then replace_whitespace: each of \t\n\v\f\r becomes a space
    let col = 0, expanded = '';
    for (const ch of text) {
      if (ch === '\t') { const n = 8 - (col % 8); expanded += ' '.repeat(n); col += n; }
      else if (ch === '\n' || ch === '\r') { expanded += ch; col = 0; }
      else { expanded += ch; col++; }
    }
    const spaced = expanded.replace(/[\t\n\x0b\x0c\r]/g, ' ');
    const chunks = spaced.split(/([\t\n\x0b\x0c\r ]+)/).filter(c => c).reverse();
    const blank = s => !s.trim();
    const lines = [];
    while (chunks.length) {
      let cur = [], curLen = 0;
      if (blank(chunks[chunks.length - 1]) && lines.length) chunks.pop();
      while (chunks.length) {
        const l = len(chunks[chunks.length - 1]);
        if (curLen + l <= width) { cur.push(chunks.pop()); curLen += l; } else break;
      }
      if (chunks.length && len(chunks[chunks.length - 1]) > width) {
        const spaceLeft = width < 1 ? 1 : width - curLen;
        const [head, tail] = cut(chunks[chunks.length - 1], spaceLeft);
        cur.push(head); chunks[chunks.length - 1] = tail;
        curLen = cur.reduce((a, c) => a + len(c), 0);
      }
      if (cur.length && blank(cur[cur.length - 1])) { curLen -= len(cur[cur.length - 1]); cur.pop(); }
      if (cur.length) lines.push(cur.join(''));
    }
    return lines;
  }

  /** A number written as Python's f-string writes it: 12.5, 0.55, 9. */
  const num = v => (Number.isInteger(v) ? String(v) : String(v));
  const hex2 = i => i.toString(16).padStart(2, '0');

  // ── the layout source (graph_svg.dot_source) ─────────────────────────────────────────────────
  function label(kind, text, S) {
    const lines = wrap(text, S.wrap_chars);
    const rowsOf = lines.length ? lines : [''];
    const extra = Math.max(0, roundHalfEven((S.line_height - 1.0) * S.font_size)), pad = Math.floor(extra / 2), spacing = extra % 2;
    const rows = rowsOf.map(l => `<tr><td cellpadding="${pad}">${escape(l)}</td></tr>`).join('');
    const cap = kind ? `<tr><td cellpadding="0"><font point-size="${num(S.kind_font_size)}" color="#0000fe">${escape(kind.toUpperCase())}</font></td></tr>`
                     + `<tr><td cellpadding="0" height="${num(S.caption_gap)}"></td></tr>` : '';
    return `<<table border="0" cellborder="0" cellspacing="${spacing}" cellpadding="0">${cap}${rows}</table>>`;
  }

  /** [source, kinds, readings] for nodes [[key, kind, text]] and edges [[source key, reading, target key]], as graph_svg.dot_source. */
  function dotSource(nodes, edges, rankdir, S) {
    const kinds = [...new Set(nodes.map(([, k]) => k).filter(k => k))];   // order of first appearance — colours depend on it
    const dir = rankdir || S.rankdir;
    if (!dir) throw new Error("KeyError: 'rankdir' — give a direction; the style sets none");
    const out = ['digraph G {',
      `  graph [rankdir=${dir}, ranksep=${num(S.ranksep)}, nodesep=${num(S.nodesep)}, bgcolor="transparent", pad=0.1];`,
      `  node [shape=box, style="rounded,filled", fontname="${S.font}", fontsize=${num(S.font_size)}, fontcolor="#0000fd", penwidth=1.2, margin="${S.box_padding}"];`,
      `  edge [fontname="${S.font}", fontsize=${num(S.edge_font_size)}, fontcolor="#0000fe", color="#0000fc", arrowsize=0.7, penwidth=1.0];`];
    for (const [key, kind, text] of nodes) {
      const i = kind ? kinds.indexOf(kind) : 99;
      out.push(`  "${key}" [label=${label(kind, text, S)}, fillcolor="#0001${hex2(i)}", color="#0002${hex2(i)}"];`);
    }
    // one column per kind, when no link joins two things of that kind
    const of = new Map(nodes.map(([key, kind]) => [key, kind]));
    for (const kind of kinds) {
      const members = nodes.filter(([, k]) => k === kind).map(([key]) => key);
      if (members.length > 1 && !edges.some(([s, , d]) => of.get(s) === kind && of.get(d) === kind)) {
        out.push('  { rank=same; ' + members.map(m => `"${m}";`).join(' ') + ' }');
      }
    }
    // a kind that only receives links and is not the graph's main destination is laid out on the far side
    const reach = new Map(kinds.map(k => [k, new Set()]));
    for (let n = 0; n < kinds.length; n++) {
      for (const [s, , d] of edges) {
        if (of.get(s) && of.get(d)) { const r = reach.get(of.get(s)); r.add(of.get(d)); for (const x of reach.get(of.get(d))) r.add(x); }
      }
    }
    const sinks = kinds.filter(k => !edges.some(([s]) => of.get(s) === k) && edges.some(([, , d]) => of.get(d) === k));
    let main = null, best = -Infinity;
    for (const k of sinks) { const score = kinds.filter(o => reach.get(o).has(k)).length; if (score > best) { best = score; main = k; } }
    const readings = [...new Set(edges.map(([, r]) => r))];
    for (const [s, reading, d] of edges) {
      const i = readings.indexOf(reading);   // line #0003xx, its label #0004xx — blended differently, for their contrast minimums
      const a = `label="${escape(reading)}", color="#0003${hex2(i)}", fontcolor="#0004${hex2(i)}"`;
      out.push(sinks.includes(of.get(d)) && of.get(d) !== main ? `  "${d}" -> "${s}" [${a}, dir=back];` : `  "${s}" -> "${d}" [${a}];`);
    }
    out.push('}');
    return [out.join('\n'), kinds, readings];
  }

  /** A colour per name, chosen from the name's CRC-32, as graph_svg._pick: a later name that clashes moves to the next free colour. */
  function pick(names, palette, pinned) {
    const out = {}, taken = new Set();
    for (const n of names) {
      if (Object.prototype.hasOwnProperty.call(pinned, n)) { out[n] = pinned[n]; continue; }
      let i = crc32(n) % palette.length;
      for (let k = 0; k < palette.length; k++) { if (!taken.has(palette[(i + k) % palette.length])) { i = (i + k) % palette.length; break; } }
      out[n] = palette[i]; taken.add(palette[i]);
    }
    return out;
  }

  const api = { dotSource, pick, wrap, crc32, escape, roundHalfEven };
  if (typeof module === 'object' && module && module.exports) module.exports = api; else root.GraphLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
