// Views as Mermaid text, the same text as graph_rules.py: a graph's relationships, its legend, and a path.
'use strict';

const { strSort } = require('../values/order.js');
const { SPEC_SCHEMA_NODES } = require('../rules/types.js');
const { viewAt } = require('../rules/paths.js');
const { readings } = require('../rules/readings.js');

// ── views — the same text as graph_rules.py ────────────────────────────────────
const SCHEMA_LABELS = [...SPEC_SCHEMA_NODES, 'LikelihoodBand']; // left out of views: the schema, and §20's likelihood scale
function caption(g, i) {
  const p = g.p(i),
    t = p.name || p.title || p.label;
  return (typeof t === 'string' && t ? `${i}<br/>${t}` : i).replace(/"/g, "'");
}

// A relationship type's reading (§5); undeclared (a draft), the type's own words: COUNTS_AGAINST -> counts against.
// A double quote becomes a single one, which Mermaid's label cannot hold.
const word = (typeWords, t) => ((typeWords.get(t) || [])[0] || t.replace(/_/g, ' ').toLowerCase()).replace(/"/g, "'");
// The graph's knowledge as a Mermaid flowchart: every node but the schema's, and every relationship between them.
// Each relationship is labelled by its reading (§5), or its type if none is declared. Sorted, so the text is the same
// as graph_rules.py's.
function mermaidGraph(g, shared) {
  const ids = strSort([...g.nodes.keys()].filter((i) => !SCHEMA_LABELS.some((label) => g.nodes.get(i)[0].has(label)))),
    v = new Map(ids.map((i, k) => [i, 'n' + k])),
    typeWords = readings(g, shared);
  return [
    'flowchart LR',
    ...ids.map((i) => `    ${v.get(i)}["${caption(g, i)}"]`),
    ...strSort(
      g.edges
        .filter(([s, , d]) => v.has(s) && v.has(d))
        .map(([s, t, d]) => `    ${v.get(s)} -->|${word(typeWords, t)}| ${v.get(d)}`),
    ),
  ].join('\n');
}
// What each reading in the relationships view stands for: one line per relationship type drawn,
// `reading = TYPE`, with ` · reverse: …` when a reverse reading is declared.
function legend(g, shared) {
  const ids = new Set([...g.nodes.keys()].filter((i) => !SCHEMA_LABELS.some((label) => g.nodes.get(i)[0].has(label)))),
    typeWords = readings(g, shared);
  const used = strSort([...new Set(g.edges.filter(([s, , d]) => ids.has(s) && ids.has(d)).map((e) => e[1]))]);
  return used
    .map(
      (t) => `${word(typeWords, t)} = ${t}` + ((typeWords.get(t) || [])[1] ? ` · reverse: ${typeWords.get(t)[1]}` : ''),
    )
    .join('\n');
}
// A path seen at an altitude (§22): the path, then what it shows at that level, in order.
function mermaidPath(g, top, level) {
  const items = viewAt(g, top, level),
    lines = [
      'flowchart TB',
      `    p["${caption(g, top)}<br/>at altitude ${level}"]`,
      ...items.map((x, k) => `    s${k}["${caption(g, x)}"]`),
    ];
  if (items.length) lines.push('    p --> s0');
  for (let k = 0; k < items.length - 1; k++) lines.push(`    s${k} --> s${k + 1}`);
  return lines.join('\n');
}

module.exports = { SCHEMA_LABELS, word, mermaidGraph, legend, mermaidPath };
