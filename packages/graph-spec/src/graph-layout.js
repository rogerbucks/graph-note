/*
The Graphviz layout source for a graph, in plain JavaScript — byte-identical to what graph_svg.py writes (python/graph_spec), so a
drawing made in the editor and one made by the Python drawing script are laid out from the same text (spec §12).

Usage:
  In a page:  <script src="graph-layout.js"></script>  then  GraphLayout.dotSource(nodes, edges, 'LR', style)
  In Node:    require('@thoughtknot/graph-spec/src/graph-layout.js')

Writes: nothing (library).

nodes: [[key, kind, text]]; edges: [[source key, reading, target key]]; style: the locked style, graph_svg.style.json;
suggested (optional): the keys of boxes drawn under a suggested name, dashed and labelled so, as dot_source's suggested.
Returns [source, kinds, readings], as dot_source does. typedSource(source, plan, style) lays that source out as a
diagram type (editor spec §15), as graph_svg's diagram_types.typed_source does. The parts Python lends it — textwrap, zlib.crc32, html.escape and
round — are ported here exactly, each proved against Python by the layout tests. Nothing Node-specific.
*/
/* global module -- the export for Node, beside the page global below */
(function (root) {
  'use strict';

  // ── the parts Python lends the layout ────────────────────────────────────────────────────────
  /** Python's round(): the nearest whole number, halves to the even one. */
  function roundHalfEven(x) {
    const f = Math.floor(x),
      d = x - f;
    const r = d > 0.5 ? f + 1 : d < 0.5 ? f : f % 2 === 0 ? f : f + 1;
    return r === 0 ? 0 : r; // never -0
  }

  /** Python's html.escape(s), quote=True. */
  const escape = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');

  /** zlib.crc32 of the UTF-8 bytes of a string, unsigned. */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(s) {
    let c = 0xffffffff;
    for (const b of new TextEncoder().encode(s)) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /** What Python's str.isspace() is true for. */
  const PY_SPACE = String.fromCodePoint(
    ...[
      0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003,
      0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
    ],
  );

  /** Python's textwrap.wrap(text, width, break_on_hyphens=False), with its other defaults. Lengths count code points, as Python does. */
  function wrap(text, width) {
    const len = (s) => [...s].length;
    const cut = (s, n) => {
      const cs = [...s];
      return [cs.slice(0, n).join(''), cs.slice(n).join('')];
    };
    // expand_tabs (tab size 8), then replace_whitespace: each of \t\n\v\f\r becomes a space
    let col = 0,
      expanded = '';
    for (const ch of text) {
      if (ch === '\t') {
        const n = 8 - (col % 8);
        expanded += ' '.repeat(n);
        col += n;
      } else if (ch === '\n' || ch === '\r') {
        expanded += ch;
        col = 0;
      } else {
        expanded += ch;
        col++;
      }
    }
    const spaced = expanded.replace(/[\t\n\v\f\r]/g, ' ');
    const chunks = spaced
      .split(/([\t\n\v\f\r ]+)/)
      .filter((c) => c)
      .reverse();
    // a chunk Python's str.strip() empties, by its isspace(): unlike JavaScript's trim(), that takes in U+001C–U+001F and
    // U+0085 and leaves out U+FEFF. Not the reader's whitespace, since this mirrors textwrap
    const blank = (s) => [...s].every((c) => PY_SPACE.includes(c));
    const lines = [];
    while (chunks.length) {
      let cur = [],
        curLen = 0;
      if (blank(chunks[chunks.length - 1]) && lines.length) chunks.pop();
      while (chunks.length) {
        const chunkLen = len(chunks[chunks.length - 1]);
        if (curLen + chunkLen <= width) {
          cur.push(chunks.pop());
          curLen += chunkLen;
        } else break;
      }
      if (chunks.length && len(chunks[chunks.length - 1]) > width) {
        const spaceLeft = width < 1 ? 1 : width - curLen;
        const [head, tail] = cut(chunks[chunks.length - 1], spaceLeft);
        cur.push(head);
        chunks[chunks.length - 1] = tail;
        curLen = cur.reduce((a, c) => a + len(c), 0);
      }
      if (cur.length && blank(cur[cur.length - 1])) {
        curLen -= len(cur[cur.length - 1]);
        cur.pop();
      }
      if (cur.length) lines.push(cur.join(''));
    }
    return lines;
  }

  /** A number written as Python's f-string writes it: 12.5, 0.55, 9. */
  const num = (v) => (Number.isInteger(v) ? String(v) : String(v));
  const hex2 = (i) => i.toString(16).padStart(2, '0');

  // ── the layout source (graph_svg.dot_source) ─────────────────────────────────────────────────
  function label(kind, text, style, suggested) {
    const lines = wrap(text, style.wrap_chars);
    const rowsOf = lines.length ? lines : [''];
    const extra = Math.max(0, roundHalfEven((style.line_height - 1.0) * style.font_size)),
      pad = Math.floor(extra / 2),
      spacing = extra % 2;
    const rows = rowsOf.map((line) => `<tr><td cellpadding="${pad}">${escape(line)}</td></tr>`).join('');
    const cap = kind
      ? `<tr><td cellpadding="0"><font point-size="${num(style.kind_font_size)}" color="#0000fe">${escape(kind.toUpperCase())}</font></td></tr>` +
        `<tr><td cellpadding="0" height="${num(style.caption_gap)}"></td></tr>`
      : '';
    // a box drawn under a suggested name says so beneath its text, as the caption is written (10 Oct 2026)
    const mark = suggested
      ? `<tr><td cellpadding="0" height="${num(style.caption_gap)}"></td></tr>` +
        `<tr><td cellpadding="0"><font point-size="${num(style.kind_font_size)}" color="#0000fe">${escape(style.suggested_label.toUpperCase())}</font></td></tr>`
      : '';
    return `<<table border="0" cellborder="0" cellspacing="${spacing}" cellpadding="0">${cap}${rows}${mark}</table>>`;
  }

  /**
   * [source, kinds, readings] for nodes [[key, kind, text]] and edges [[source key, reading, target key]], as
   * graph_svg.dot_source. suggested: the keys of boxes drawn under a suggested name, each outlined in the style's
   * suggested_style and labelled with its suggested_label. One key given as a plain string is refused, as Python refuses
   * it: read letter by letter, it would mark boxes whose keys are part of it.
   */
  function dotSource(nodes, edges, rankdir, style, suggested = []) {
    if (typeof suggested === 'string')
      throw new TypeError('suggested is a collection of keys, not one key as a string');
    const marked = new Set(suggested);
    const kinds = [...new Set(nodes.map(([, k]) => k).filter((k) => k))]; // order of first appearance — colours depend on it
    const dir = rankdir || style.rankdir;
    if (!dir) throw new Error("KeyError: 'rankdir' — give a direction; the style sets none");
    const out = [
      'digraph G {',
      `  graph [rankdir=${dir}, ranksep=${num(style.ranksep)}, nodesep=${num(style.nodesep)}, bgcolor="transparent", pad=0.1];`,
      `  node [shape=box, style="rounded,filled", fontname="${style.font}", fontsize=${num(style.font_size)}, fontcolor="#0000fd", penwidth=1.2, margin="${style.box_padding}"];`,
      `  edge [fontname="${style.font}", fontsize=${num(style.edge_font_size)}, fontcolor="#0000fe", color="#0000fc", arrowsize=0.7, penwidth=1.0];`,
    ];
    for (const [key, kind, text] of nodes) {
      const i = kind ? kinds.indexOf(kind) : 99;
      const dashed = marked.has(key) ? `, style="${style.suggested_style}"` : '';
      out.push(
        `  "${key}" [label=${label(kind, text, style, marked.has(key))}, fillcolor="#0001${hex2(i)}", color="#0002${hex2(i)}"${dashed}];`,
      );
    }
    // one column per kind, when no link joins two things of that kind
    const of = new Map(nodes.map(([key, kind]) => [key, kind]));
    for (const kind of kinds) {
      const members = nodes.filter(([, k]) => k === kind).map(([key]) => key);
      if (members.length > 1 && !edges.some(([s, , d]) => of.get(s) === kind && of.get(d) === kind)) {
        out.push('  { rank=same; ' + members.map((m) => `"${m}";`).join(' ') + ' }');
      }
    }
    // a kind that only receives links and is not the graph's main destination is laid out on the far side
    const reach = new Map(kinds.map((k) => [k, new Set()]));
    for (let n = 0; n < kinds.length; n++) {
      for (const [s, , d] of edges) {
        if (of.get(s) && of.get(d)) {
          const r = reach.get(of.get(s));
          r.add(of.get(d));
          for (const x of reach.get(of.get(d))) r.add(x);
        }
      }
    }
    const sinks = kinds.filter(
      (k) => !edges.some(([s]) => of.get(s) === k) && edges.some(([, , d]) => of.get(d) === k),
    );
    let main = null,
      best = -Infinity;
    for (const k of sinks) {
      const score = kinds.filter((o) => reach.get(o).has(k)).length;
      if (score > best) {
        best = score;
        main = k;
      }
    }
    const readings = [...new Set(edges.map(([, r]) => r))];
    for (const [s, reading, d] of edges) {
      const i = readings.indexOf(reading); // line #0003xx, its label #0004xx — blended differently, for their contrast minimums
      const a = `label="${escape(reading)}", color="#0003${hex2(i)}", fontcolor="#0004${hex2(i)}"`;
      out.push(
        sinks.includes(of.get(d)) && of.get(d) !== main
          ? `  "${d}" -> "${s}" [${a}, dir=back];`
          : `  "${s}" -> "${d}" [${a}];`,
      );
    }
    out.push('}');
    return [out.join('\n'), kinds, readings];
  }

  // ── a diagram type's source (editor spec §15; graph_svg's diagram_types.typed_source) ───────────────────
  const KIND_COLUMN = /^ {2}\{ rank=same; /;
  const LINK = /^ {2}"[^"]*" -> "[^"]*" \[label=/;
  const BACK = /^ {2}("[^"]*") -> ("[^"]*") \[(.*), dir=back\];$/;
  const TYPE_DIRECTION = { tree: 'TB', flow: 'LR', radial: 'LR', lanes: 'LR', timeline: 'LR' };

  /** The one direction a diagram type is laid out in, when nothing else sets one: a tree down, the rest across. */
  const typeDirection = (plan) => TYPE_DIRECTION[plan.type];

  /**
   * The layout source `dot` laid out as a diagram type, by its plan (the core's types.ts): a radial drawing around its
   * centre, by Graphviz's twopi; a tree, a flow, lanes and a timeline with every link laid out forward and no kind put in
   * a column of its own, a tree's other links and every link of a timeline never moving a thing (constraint=false);
   * lanes a box for each kind, labelled as a group is; a timeline each day's things on one rank, the days in order,
   * joined by links never drawn, after every link drawn, so Graphviz numbers the drawn links as before. No plan: `dot`.
   */
  function typedSource(dot, plan, style) {
    if (!plan) return dot;
    const lines = dot.split('\n');
    if (plan.type === 'radial') {
      lines.splice(2, 0, `  graph [layout=twopi, root="${plan.centre}", overlap=false];`);
      return lines.join('\n');
    }
    const tree = new Set(plan.tree || []),
      out = [];
    let n = -1;
    for (const line of lines) {
      if (KIND_COLUMN.test(line)) continue;
      if (!LINK.test(line)) {
        out.push(line);
        continue;
      }
      n++;
      const back = BACK.exec(line);
      const forward = back ? `  ${back[2]} -> ${back[1]} [${back[3]}];` : line;
      const free = plan.type === 'timeline' || (plan.type === 'tree' && !tree.has(n));
      out.push(free ? `${forward.slice(0, -2)}, constraint=false];` : forward);
    }
    const added = [];
    // a box labelled as a group's is (style-source.ts, nudgedSource): a lane, or a group drawn inside its lane
    const box = (name, label, keys, inside = '') =>
      `subgraph ${name} {label=<${escape(label)}>; fontname="${style.font}"; ` +
      `fontsize=${num(style.kind_font_size)}; fontcolor="#0000fe"; color="#0000fe"; style="rounded"; ` +
      `${keys.map((k) => `"${k}"; `).join('')}${inside}}`;
    if (plan.type === 'lanes')
      plan.lanes.forEach(([label, keys], i) => {
        const inner = (plan.groups || []).filter(([, members]) => keys.includes(members[0]));
        const nested = inner.map(([group, members], j) => box(`cluster_lane_${i + 1}_${j + 1}`, group, members));
        added.push(`  ${box(`cluster_lane_${i + 1}`, label, keys, nested.join(' '))}`);
      });
    if (plan.type === 'timeline')
      plan.dates.forEach((keys, i) => {
        if (keys.length > 1) added.push(`  {rank=same; ${keys.map((k) => `"${k}"`).join('; ')};}`);
        if (i) added.push(`  "${plan.dates[i - 1][0]}" -> "${keys[0]}" [style=invis];`);
      });
    out.splice(out.length - 1, 0, ...added);
    // groups inside lanes: without newrank, Graphviz may take a thing out of its box without a word
    if (plan.type === 'lanes' && plan.groups && plan.groups.length) out.splice(1, 0, '  newrank=true;');
    return out.join('\n');
  }

  /** A colour per name, chosen from the name's CRC-32, as graph_svg._pick: a later name that clashes moves to the next free colour. */
  function pick(names, palette, pinned) {
    const out = {},
      taken = new Set();
    for (const n of names) {
      if (Object.prototype.hasOwnProperty.call(pinned, n)) {
        out[n] = pinned[n];
        continue;
      }
      let i = crc32(n) % palette.length;
      for (let k = 0; k < palette.length; k++) {
        if (!taken.has(palette[(i + k) % palette.length])) {
          i = (i + k) % palette.length;
          break;
        }
      }
      out[n] = palette[i];
      taken.add(palette[i]);
    }
    return out;
  }

  const api = { dotSource, typedSource, typeDirection, pick, wrap, crc32, escape, roundHalfEven };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.GraphLayout = api;
})(typeof self !== 'undefined' ? self : this);
