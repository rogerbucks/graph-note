// A process run and its log (editor spec §34). Its Python twin is graphspec/engine/process/runs.py, and
// test/process-core-cases.json holds both to the same answers.
// - A run's state is its log: Entry things, each saying a state was entered or left, in order. The CURRENT links come
//   from the log, made again after each new entry. So a lost one comes back the same (run_log_is_truth).
// - A state may hold its own machine through CONTAINS links, with no depth limit. Entering it enters the inner
//   machine's first state too. Each inner event is logged under its parent state (machines_inside_states). A loop of
//   CONTAINS links is refused, as the recursion rules ask.
'use strict';

const { Graph } = require('../graph/graph.js');

/** A run's log, in order: each entry's number, what it did, its state, the state it is under and when. */
function runLog(graph, run) {
  return graph
    .labelled('Entry')
    .map((id) => graph.p(id))
    .filter((p) => p.run === run)
    .map((p) => ({ seq: p.seq, did: p.did, state: p.state, under: p.under ?? null, at: p.at ?? null }))
    .sort((a, b) => a.seq - b.seq);
}

/** The states a run is in now, from its log alone: entered and not left since, outermost first. */
function currentOf(graph, run) {
  const now = [];
  for (const e of runLog(graph, run)) {
    const i = now.indexOf(e.state);
    if (e.did === 'entered' && i < 0) now.push(e.state);
    if (e.did === 'left' && i >= 0) now.splice(i, 1);
  }
  return now;
}

/** The state that holds a state's machine, or null. */
const containerOf = (graph, state) => {
  const c = graph.inc(state, 'CONTAINS').map((e) => e[0]);
  return c.length ? c[0] : null;
};

/** The states holding a state, outermost first. A loop of CONTAINS links is refused. */
function holdersOf(graph, state) {
  const out = [],
    seen = new Set([state]);
  for (let at = containerOf(graph, state); at !== null; at = containerOf(graph, at)) {
    if (seen.has(at)) throw new Error(`refused: states contain each other in a loop through ${at} (editor spec §34)`);
    seen.add(at);
    out.unshift(at);
  }
  return out;
}

/** The first state of the machine a state holds, or null. */
const innerStart = (graph, state) => {
  const starts = graph
    .out(state, 'CONTAINS')
    .map((e) => e[2])
    .filter((s) => graph.p(s).initial === true);
  return starts.length ? starts[0] : null;
};

/** The entries that enter a state, then each inner machine's first state, at any depth. */
function enterState(graph, run, state, at = null) {
  let seq = runLog(graph, run).reduce((n, e) => Math.max(n, e.seq), 0);
  const out = [],
    seen = new Set();
  for (let s = state; s !== null; s = innerStart(graph, s)) {
    if (seen.has(s)) throw new Error(`refused: states contain each other in a loop through ${s} (editor spec §34)`);
    seen.add(s);
    holdersOf(graph, s);
    out.push({ seq: ++seq, did: 'entered', state: s, under: containerOf(graph, s), at });
  }
  return out;
}

/** The entries that leave a state, every current state inside it first, innermost first. */
function leaveState(graph, run, state, at = null) {
  let seq = runLog(graph, run).reduce((n, e) => Math.max(n, e.seq), 0);
  const now = currentOf(graph, run);
  const inside = now.filter((s) => s === state || holdersOf(graph, s).includes(state));
  return inside.reverse().map((s) => ({ seq: ++seq, did: 'left', state: s, under: containerOf(graph, s), at }));
}

/** The graph with a run's CURRENT links made again from its log, after any others it has. */
function refreshCurrent(graph, run) {
  const edges = graph.edges.filter((e) => !(e[0] === run && e[1] === 'CURRENT'));
  for (const s of currentOf(graph, run)) edges.push([run, 'CURRENT', s, {}]);
  return new Graph(graph.nodes, edges);
}

/** The graph with new entries added to a run's log, each an Entry thing, and its CURRENT links made again. */
function withEntries(graph, run, entries) {
  const nodes = new Map(graph.nodes);
  for (const e of entries) {
    const id = `${run}:${e.seq}`;
    const props = { id, run, seq: e.seq, did: e.did, state: e.state };
    if (e.under !== null) props.under = e.under;
    if (e.at !== null) props.at = e.at;
    nodes.set(id, [new Set(['Entry']), props]);
  }
  return refreshCurrent(new Graph(nodes, graph.edges), run);
}

/** A run moved from one state to another: the entries that leave the first, then those that enter the second. */
function moveRun(graph, run, from, to, at = null) {
  const left = leaveState(graph, run, from, at);
  const after = withEntries(graph, run, left);
  return left.concat(enterState(after, run, to, at));
}

module.exports = { runLog, currentOf, holdersOf, enterState, leaveState, moveRun, withEntries, refreshCurrent };
