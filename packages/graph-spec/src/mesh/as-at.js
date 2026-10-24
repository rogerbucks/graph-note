// A graph as at a date, on either of its two kinds of time (editor spec §29, two_kinds_of_time):
// - recorded time: when a thing or link was written into the graph, its `recorded_at`. As at a date, the graph holds
//   only what was recorded by then. A thing superseded by then (§12, a successor's SUPERSEDES) is no longer current.
// - real-world time: when it holds in the world, from its `valid_from` up to its `valid_to`. Either end may be left
//   open. As at a date, the graph holds only what holds then.
// A thing or link with no time on an axis holds at every date on it. Lenses (§15) and every other rule then run on the
// graph as at the date, so each answers as it was true then. Its Python twin is graphspec/engine/mesh/as_at.py, and
// test/two-times-cases.json holds both to the same answers.
'use strict';

const { Graph } = require('../graph/graph.js');
const { lensBuckets } = require('../rules/lenses.js');

/** The two axes of time a graph is read as at. */
const AXES = ['recorded', 'real'];

// A value of time as its text: a date or an instant as written, anything else as it is.
const text = (v) => (v && typeof v === 'object' && 's' in v ? v.s : v === undefined || v === null ? null : String(v));
// Whether `a` comes after `b`, compared as written: ISO 8601 text orders as its times do.
const after = (a, b) => a > b;

// Whether something with these properties holds as at `date` on `axis`.
function holds(p, axis, date) {
  if (axis === 'recorded') {
    const at = text(p.recorded_at);
    return at === null || !after(at, date);
  }
  const from = text(p.valid_from),
    to = text(p.valid_to);
  return (from === null || !after(from, date)) && (to === null || after(to, date));
}

/** `graph` as at `date` (YYYY-MM-DD, or an instant) on `axis`: 'recorded' or 'real'. */
function asAt(graph, axis, date) {
  if (!AXES.includes(axis)) throw new Error(`The axis of time must be recorded or real, not ${axis}`);
  const on = String(date);
  const kept = new Set([...graph.nodes].filter(([, [, p]]) => holds(p, axis, on)).map(([id]) => id));
  if (axis === 'recorded')
    for (const [from, type, to, p] of graph.edges)
      if (type === 'SUPERSEDES' && kept.has(from) && holds(p || {}, axis, on)) kept.delete(to);
  const nodes = new Map([...graph.nodes].filter(([id]) => kept.has(id)));
  const edges = graph.edges.filter(([from, , to, p]) => kept.has(from) && kept.has(to) && holds(p || {}, axis, on));
  return new Graph(nodes, edges);
}

/** A lens (§15) run on `graph` as at `date` on `axis`: each thing's bucket as it was then. */
const lensAsAt = (graph, rule, axis, date) => lensBuckets(asAt(graph, axis, date), rule);

module.exports = { AXES, asAt, lensAsAt };
