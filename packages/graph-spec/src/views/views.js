// Every view of a graph at once: its flat projection, relationships, legend, and each top path at each altitude.
'use strict';

const { strSort } = require('../values/order.js');
const { jcs } = require('../hashing/canonical-json.js');
const { project } = require('../rules/projection.js');
const { mermaidGraph, legend, mermaidPath } = require('./mermaid.js');

const tops = (g) => strSort(g.labelled('Path').filter((p) => !g.inc(p, 'STEP').some((e) => g.has(e[0], 'Path'))));
// Every view of one graph:
// - its flat projection;
// - its relationships with their legend;
// - each top path at each altitude it spans, from its own down to 0.
function views(g, shared) {
  const [blocks, rels] = project(g),
    out = {
      projection: jcs(JSON.parse(JSON.stringify({ blocks, relationships: rels }))),
      relationships: mermaidGraph(g, shared),
      legend: legend(g, shared),
    };
  for (const t of tops(g))
    for (let level = Math.trunc(Number(g.p(t).altitude || 0)); level >= 0; level--)
      out[`path ${t} at ${level}`] = mermaidPath(g, t, level);
  return out;
}

module.exports = { views };
