// The process core (editor spec §34): one kind of data under every process view. Its Python twin is
// graphspec/engine/process/core.py, and test/process-core-cases.json holds both to the same answers. It reads the plain
// graph the reader gives and writes nothing: a change it suggests comes back as graph text to join like any other.
// - The core has exactly eight kinds. Time is properties, and ownership is an OWNS link. A role is an Actor kept apart
//   from the Person who plays it. Layout lives in view settings. A thing of any other kind is flagged, never refused
//   (core_of_eight).
// - A transition is a TRANSITION link between states. It can become a Transition thing, joined by FROM and TO links.
//   That is for one carrying a decision, a review, commentary or an action with side effects (hybrid_transitions).
// - A query walks transitions like any other thing. So one path goes from a concept, through a state, to a part of a
//   diagram (transitions_walkable).
// - A guard is a Guard thing holding an expression, or naming a function and its version, both shown (guards_are_data).
// - Each process has one default running rule. A run may override it on the run alone (running_rule_override).
'use strict';

const { guardHolds } = require('../rules/guards.js');
const { Graph } = require('../graph/graph.js');

/** The eight kinds of the core, in the order the spec names them. */
const KINDS = ['Step', 'Dependency', 'Condition', 'Decision', 'Event', 'Actor', 'Artefact', 'Resource'];
/** The labels that hold a process together rather than being one of its kinds. */
const FRAME = ['Process', 'State', 'Transition', 'Guard', 'Run', 'Entry', 'Person'];
/** The properties that belong to a view, never to the core. */
const VIEW_PROPS = ['x', 'y', 'width', 'height', 'layout', 'lane', 'colour', 'color', 'collapsed'];
/** What a transition carries that makes it worth promoting to a thing of its own. */
const PROMOTE_FOR = ['decision', 'review', 'comment', 'do'];
/** The ways a process can choose among the transitions that may fire. */
const RUNNING_RULES = ['first-match', 'all-enabled', 'by-priority'];

const linkId = (a, b) => `transition:${a}->${b}`;
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sortRows = (rows) => rows.sort((x, y) => byText(JSON.stringify(x), JSON.stringify(y)));

/** Each thing's kind, what is flagged, the view settings kept apart and the core left without them (core_of_eight). */
function coreOfEight(graph) {
  const kind = {},
    flags = [],
    view = {},
    core = {};
  for (const [id, [labels, props]] of graph.nodes) {
    const ls = [...labels];
    const k = KINDS.find((x) => ls.includes(x));
    if (k) kind[id] = k;
    else if (!ls.some((l) => FRAME.includes(l))) flags.push(['ninth-kind', id, ls.sort().join(':')]);
    if (ls.includes('Actor') && ls.includes('Person')) flags.push(['person-as-role', id, '']);
    if (Object.hasOwn(props, 'owner')) flags.push(['owner-as-property', id, String(props.owner)]);
    const kept = {},
      shown = {};
    for (const p of Object.keys(props).sort()) (VIEW_PROPS.includes(p) ? shown : kept)[p] = props[p];
    if (Object.keys(shown).length) view[id] = shown;
    core[id] = kept;
  }
  return { kinds: KINDS, kind, flags: sortRows(flags), view, core };
}

/** Every transition: each TRANSITION link and each promoted Transition thing, with what it carries. */
function transitionsOf(graph) {
  const out = [];
  for (const [a, type, b, props] of graph.edges) {
    if (type !== 'TRANSITION') continue;
    const carries = PROMOTE_FOR.filter((p) => Object.hasOwn(props || {}, p));
    out.push({ id: linkId(a, b), from: a, to: b, promoted: false, event: props.event ?? null, carries });
  }
  for (const id of graph.labelled('Transition')) {
    const from = graph.out(id, 'FROM').map((e) => e[2]),
      to = graph.out(id, 'TO').map((e) => e[2]);
    const props = graph.p(id);
    out.push({
      id,
      from: from.length === 1 ? from[0] : null,
      to: to.length === 1 ? to[0] : null,
      promoted: true,
      event: props.event ?? null,
      carries: PROMOTE_FOR.filter((p) => Object.hasOwn(props, p)),
    });
  }
  return out.sort((x, y) => byText(x.id, y.id));
}

/** A value written as graph text. */
function literal(v) {
  if (typeof v === 'string') return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return `[${v.map(literal).join(', ')}]`;
  return String(v);
}

/**
 * A TRANSITION link from `a` to `b` promoted to a Transition thing named `id`. It comes as a graph change: the link to
 * remove and the lines of graph text to add. The link's properties move to the thing. The lines join and can be contested
 * like any other (hybrid_transitions).
 */
function promoteTransition(graph, a, b, id) {
  const link = graph.edges.find((e) => e[0] === a && e[1] === 'TRANSITION' && e[2] === b);
  if (!link) throw new Error(`refused: there is no transition from ${a} to ${b} to promote (§34)`);
  if (graph.nodes.has(id)) throw new Error(`refused: ${id} is already a thing in the graph (§34)`);
  const props = Object.keys(link[3] || {})
    .sort()
    .map((k) => `, ${k}: ${literal(link[3][k])}`)
    .join('');
  return {
    remove: [a, 'TRANSITION', b],
    lines: [`(${id}:Transition {id: ${literal(id)}${props}})`, `(${id})-[:FROM]->(${a})`, `(${id})-[:TO]->(${b})`],
  };
}

/**
 * The shortest path from one thing to another, walking every link either way and every transition as a thing of its
 * own (transitions_walkable). A TRANSITION link becomes a step through `transition:a->b`. Null when none joins them.
 */
function processPath(graph, from, to) {
  const next = new Map();
  const join = (x, y) => {
    (next.get(x) || next.set(x, []).get(x)).push(y);
    (next.get(y) || next.set(y, []).get(y)).push(x);
  };
  for (const [a, type, b] of graph.edges)
    if (type === 'TRANSITION') {
      join(a, linkId(a, b));
      join(linkId(a, b), b);
    } else join(a, b);
  for (const n of next.values()) n.sort(byText);
  const before = new Map([[from, null]]),
    queue = [from];
  while (queue.length) {
    const at = queue.shift();
    if (at === to) break;
    for (const n of next.get(at) || [])
      if (!before.has(n)) {
        before.set(n, at);
        queue.push(n);
      }
  }
  if (!before.has(to)) return null;
  const path = [];
  for (let at = to; at !== null; at = before.get(at)) path.unshift(at);
  return path;
}

/** The guard on a transition: its expression, or its function's name and version, and how it is shown. */
function guardOf(graph, transition) {
  const found = graph.out(transition, 'GUARDED_BY').map((e) => e[2]);
  if (!found.length) return null;
  const id = found[0],
    p = graph.p(id);
  if (typeof p.expression === 'string') return { id, expression: p.expression, shown: p.expression };
  if (typeof p.function === 'string' && p.version !== undefined)
    return { id, function: p.function, version: String(p.version), shown: `${p.function} v${p.version}` };
  return { id, shown: '', flag: 'guard-holds-nothing' };
}

/**
 * Whether a guard holds in a context. An expression is read in the guard language. A named function runs the version
 * the guard names, from `functions`: { name: { version: fn } }. A version not given is refused, never guessed.
 */
function guardAllows(guard, ctx, functions = {}) {
  if (guard.expression !== undefined) return guardHolds(guard.expression, ctx);
  const versions = Object.hasOwn(functions, guard.function) ? functions[guard.function] : null;
  if (!versions || !Object.hasOwn(versions, guard.version))
    throw new Error(`refused: no function ${guard.function} at version ${guard.version} is given (§34)`);
  return Boolean(versions[guard.version](ctx));
}

/** The running rule a run follows: its own override, or its process's one default (running_rule_override). */
function runningRuleOf(graph, run) {
  const r = graph.p(run),
    process = graph.p(r.process);
  const fallback = RUNNING_RULES.includes(process.running_rule) ? process.running_rule : null;
  if (r.running_rule !== undefined) return { rule: r.running_rule, from: 'run', process_default: fallback };
  return { rule: fallback, from: fallback === null ? 'none' : 'process', process_default: fallback };
}

/** The graph with a run's running rule overridden on the run alone; the process is left as it is. */
function overrideRunningRule(graph, run, rule) {
  if (!RUNNING_RULES.includes(rule)) throw new Error(`refused: a running rule is one of ${RUNNING_RULES.join(', ')}`);
  if (!graph.has(run, 'Run')) throw new Error(`refused: ${run} is not a run (§34)`);
  const nodes = new Map(graph.nodes);
  const [labels, props] = nodes.get(run);
  nodes.set(run, [labels, { ...props, running_rule: rule }]);
  return new Graph(nodes, graph.edges);
}

module.exports = {
  KINDS,
  RUNNING_RULES,
  coreOfEight,
  transitionsOf,
  promoteTransition,
  processPath,
  guardOf,
  guardAllows,
  runningRuleOf,
  overrideRunningRule,
};
