// §22 paths: their steps, the view of a path at an altitude, and the paths rules.
'use strict';

const { byKey } = require('../values/order.js');

// §22 paths
function pathSteps(g, pid) {
  if (!g.has(pid, 'Path')) return [];
  return g
    .out(pid, 'STEP')
    .slice()
    .sort(byKey((e) => e[3].seq || 0))
    .map((e) => ({
      seq: e[3].seq,
      id: e[2],
      altitude: g.p(e[2]).altitude,
      labels: [...g.nodes.get(e[2])[0]].sort(),
    }));
}
// A path seen at an altitude: every step that is a path above that level opened, everything at or below kept.
// `seen` stops a path that contains itself from opening forever; §22 rule 1 is what reports it.
function viewAt(g, pid, level, seen) {
  seen = new Set([...(seen || []), pid]);
  const out = [];
  for (const r of pathSteps(g, pid)) {
    if (r.labels.includes('Path') && (r.altitude || 0) > level && !seen.has(r.id))
      out.push(...viewAt(g, r.id, level, seen));
    else out.push(r.id);
  }
  return out;
}
// Everything a path steps to, at any depth up to `depth`: what folds into it. The cap and `seen` keep a cycle finite.
function below(g, top, depth = 8) {
  const seen = new Set();
  let frontier = [top];
  for (let i = 0; i < depth; i++) {
    frontier = frontier.flatMap((f) => g.out(f, 'STEP').map((e) => e[2])).filter((x) => !seen.has(x));
    frontier.forEach((x) => seen.add(x));
    if (!frontier.length) break;
  }
  return seen;
}
// §22's rules on one graph, as [label, ok] pairs; none for a graph with no paths.
function pathsRules(g) {
  const out = [],
    paths = g.labelled('Path');
  if (!paths.length) return out;
  out.push([
    '§22 rule 1: altitude falls at every step into a path — no path contains itself',
    !paths.some((s) =>
      g.out(s, 'STEP').some((e) => g.has(e[2], 'Path') && (g.p(e[2]).altitude || 0) >= (g.p(s).altitude || 0)),
    ),
  ]);
  out.push([
    "§22 rule 2: each path's steps are numbered 1 to n",
    paths.every((p) => {
      const s = g
        .out(p, 'STEP')
        .map((e) => e[3].seq)
        .sort((a, b) => a - b);
      return s.every((x, i) => x === i + 1);
    }),
  ]);
  out.push([
    '§22 rule 3: every path grounds out in facts',
    paths.every((p) => {
      const v = viewAt(g, p, 0);
      return (
        v.length &&
        !v.some((x) => g.nodes.has(x) && (g.nodes.get(x)[0].has('Path') || g.nodes.get(x)[0].has('Concept')))
      );
    }),
  ]);
  out.push([
    '§22 rule 4: a path that declares an order keeps it',
    paths.every((p) => {
      const o = g.p(p).ordered_by;
      if (!o) return true;
      const f = viewAt(g, p, 0)
        .map((x) => g.p(x)[o])
        .filter((v) => v !== undefined && v !== null);
      return f.every((a, i) => i === 0 || !(f[i - 1] > a));
    }),
  ]);
  return out;
}

module.exports = { viewAt, below, pathsRules };
