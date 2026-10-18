// §24 change sets: the DELETE and SET statements of a change set, each naming one target, read and applied to a store.
'use strict';

const { norm } = require('../values/times.js');
const { hash16 } = require('../hashing/canonical-json.js');
const { ProfileError } = require('../reader/profile-error.js');
const { S, trim } = require('../reader/whitespace.js');
const { tokens } = require('../reader/tokens.js');
const { Parser } = require('../reader/parser.js');
const { AGENT_LABELS } = require('../rules/provenance.js');

const VERBS = new Set(['MATCH', 'DELETE', 'DETACH', 'SET']);
const WORD = new RegExp(`^${S}*([A-Za-z_]+)`),
  REASON = new RegExp(`^${S}*//@${S}*reason:([^\\n]*)$`),
  BASIS = new RegExp(`^${S}*//@?${S}*(?:against|by)${S}*:`, 'i'),
  HEADER = new RegExp(`^${S}*//${S}*graph:`);
const wordOf = (line) => {
  const m = WORD.exec(line);
  return m ? m[1].toUpperCase() : '';
};
/** Whether a line holds a DELETE or a SET as a word of its own, never one inside a quoted text. */
function hasVerb(line) {
  try {
    return tokens(line).some(
      (t) => (t[0] === 'kw' && t[1] === 'SET') || (t[0] === 'id' && t[1].toUpperCase() === 'DELETE'),
    );
  } catch (e) {
    if (e instanceof ProfileError) return /\b(?:DELETE|SET)\b/i.test(line); // unreadable: the statement's reading says why
    throw e;
  }
}

/**
 * A change set's block split into its additions and its changes. A statement begins at a line that begins with MATCH,
 * DELETE, DETACH or SET. A MATCH goes on to the line that holds its DELETE or SET. Any other such line is a statement
 * of its own. A MATCH that no DELETE or SET follows belongs to the additions. The additions are the block with the
 * statements' lines blanked, so every line keeps its number. `reason` is the `//@ reason:` line directly above a
 * statement, a hint only. `basisOk` is false when a line other than the header says what the set was made against or
 * who made it.
 */
function splitChangeset(block) {
  const lines = block.split('\n'),
    start = lines.findIndex((x) => trim(x)),
    groups = [];
  let open = null,
    basisOk = true;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!trim(line)) continue;
    if (trim(line).startsWith('//')) {
      if (BASIS.test(line) || HEADER.test(line)) basisOk = false;
      continue;
    }
    // a SET whose line ends with a comma goes on to the next line, as the profile reads its values
    if (open && open.done && open.comma) {
      open.lines.push(i);
      open.comma = trim(line).endsWith(',');
      continue;
    }
    const word = wordOf(line);
    if (!VERBS.has(word)) {
      open = null;
      continue;
    }
    if (open && !open.done) {
      open.lines.push(i);
    } else {
      const above = i > 0 ? REASON.exec(lines[i - 1]) : null;
      open = { lines: [i], done: false, reason: above && trim(above[1]) ? trim(above[1]) : null };
      groups.push(open);
    }
    if (word !== 'MATCH' || hasVerb(line)) open.done = true;
    open.comma = open.done && trim(line).endsWith(',');
  }
  const changes = groups
    .filter((g) => g.done)
    .map((g) => ({
      line: g.lines[0] + 1,
      lines: g.lines,
      text: g.lines.map((i) => lines[i]).join('\n'),
      reason: g.reason,
    }));
  const taken = new Set(changes.flatMap((c) => c.lines)),
    additions = lines.map((x, i) => (taken.has(i) ? '' : x)).join('\n');
  return { additions, changes, basisOk };
}

// a statement refused at the line it has read to, with its problem's code (problem-codes.json)
const refuse = (p, message, fix, code) => {
  throw new ProfileError(p.line(), message, fix, undefined, code);
};
const ONE = 'a DELETE or SET names exactly one target (§24)';
function endOf(p, n) {
  const keys = Object.keys(n.props);
  if (keys.length !== 1 || keys[0] !== 'id' || typeof n.props.id !== 'string')
    refuse(
      p,
      'a target is named by its id alone',
      "write MATCH (v:Kind {id: '…'}) — a thing by its name, a link by its two ends and its type",
      'GN401',
    );
  return { id: n.props.id, labels: n.labels };
}

/**
 * One statement read:
 * - { op, thing } for a thing;
 * - { op, from, type, to } for a link, with `labels` and `ends` of the kinds it names;
 * - `set` for the values a SET gives. Refused, as a ProfileError, unless it is a DELETE or a SET of
 * exactly one target (req:24.cs-one-target).
 */
function readChange(text) {
  const p = new Parser(tokens(text));
  let target = null;
  if (p.at('kw', 'MATCH')) {
    p.take('kw', 'MATCH');
    const first = p.node();
    if (p.at('p', '-')) {
      p.take('p', '-');
      p.take('p', '[');
      const rel = p.at('p', ':') ? null : p.name();
      if (!p.at('p', ':'))
        refuse(p, 'a link is named by its type', 'write [r:TYPE] — a link by its two ends and its type', 'GN402');
      p.take('p', ':');
      const type = p.name();
      if (p.at('p', '{'))
        refuse(p, 'a link is named by its two ends and its type alone', 'leave its values to a SET', 'GN403');
      p.take('p', ']');
      p.take('arrow');
      const second = p.node(),
        a = endOf(p, first),
        b = endOf(p, second);
      target = { kind: 'link', v: rel, from: a.id, type, to: b.id, ends: [a.labels, b.labels] };
    } else {
      const a = endOf(p, first);
      target = { kind: 'thing', v: first.v, thing: a.id, labels: a.labels };
    }
    if (p.at('p', ',') || p.at('p', '-') || p.at('kw', 'MATCH'))
      refuse(p, 'this names more than one target', ONE, 'GN404');
  }
  const named = (v) => {
    if (!target) return { kind: 'thing', v, thing: v, labels: [] }; // SET name.key: the name is the thing's id (§3)
    if (v !== target.v) refuse(p, `${v} is not the one target`, ONE, 'GN405');
    return target;
  };
  if (p.at('id') && ['DELETE', 'DETACH'].includes(p.peek()[1].toUpperCase())) {
    if (!target) refuse(p, 'a DELETE needs the target it removes', "write MATCH (v:Kind {id: '…'}) DELETE v", 'GN406');
    const detach = p.peek()[1].toUpperCase() === 'DETACH';
    p.i++;
    if (detach) {
      if (!(p.at('id') && p.peek()[1].toUpperCase() === 'DELETE'))
        refuse(p, 'DETACH is followed by DELETE', 'write DETACH DELETE v', 'GN407');
      p.i++;
    }
    const v = p.name();
    named(v);
    if (p.at('p', ',')) refuse(p, 'this removes more than one target', ONE, 'GN408');
    if (!p.at('end'))
      refuse(p, `unexpected '${p.peek()[1]}'`, 'a DELETE ends after the one target it removes', 'GN409');
    if (detach && target.kind === 'link') refuse(p, 'a link has no links to detach', 'write DELETE r', 'GN410');
    return { ...target, op: (detach ? 'detach-delete-' : 'delete-') + target.kind };
  }
  if (!p.at('kw', 'SET')) refuse(p, 'a change is a DELETE or a SET', 'write DELETE or SET after the MATCH', 'GN411');
  p.take('kw', 'SET');
  const set = {};
  let named1 = null,
    first = null;
  for (;;) {
    const v = p.name();
    if (first !== null && v !== first) refuse(p, 'this changes more than one target', ONE, 'GN412');
    first = v;
    named1 = named(v);
    p.take('p', '.');
    const key = p.name();
    if (key === 'id')
      refuse(
        p,
        `SET would change ${v}'s id, and a node's id never changes (§3)`,
        'write the right node, then supersede it (§12)',
        'GN413',
      );
    if (['__proto__', 'constructor', 'prototype'].includes(key))
      refuse(p, `${key} is not a name a SET may give a value to`, 'choose another name for the value', 'GN414');
    p.take('p', '=');
    set[key] = p.value();
    if (!p.at('p', ',')) break;
    p.take('p', ',');
  }
  if (!p.at('end')) refuse(p, `unexpected '${p.peek()[1]}'`, 'a SET ends after its values', 'GN415');
  return { ...named1, op: 'set-' + named1.kind, set };
}

/** A change's id, derived from its statement and never written: the same change, written either way, has the same id. */
function changeId(c) {
  const o = { op: c.op },
    nfc = (s) => s.normalize('NFC'); // an id composed or decomposed names the same thing
  if (c.kind === 'thing') o.thing = nfc(c.thing);
  else Object.assign(o, { from: nfc(c.from), type: c.type, to: nfc(c.to) });
  if (c.set) {
    o.set = {};
    for (const k of Object.keys(c.set)) o.set[k] = norm(c.set[k]);
  }
  return hash16(o);
}

// A record is corrected by a superseding addition (§12). A cache is the engine's part (§11, §20). Neither is ever
// removed or changed by a change set, whoever it is by.
// (matched on any label a thing carries; a Delivery is an event, and an Assessment is a record even without Event)
const RECORD_LABELS = ['Event', 'IssuedDocument', 'Decision', 'Delivery', 'Assessment'];
const CACHE_KEYS = ['likelihood', 'confidence', 'status'];
/** Whether a new thing is a record a model may not add: an event, an issued document or a decision. An assessment it
 * makes as itself is its own to add. */
const isRecordAdd = (labels) =>
  labels.some((x) => RECORD_LABELS.includes(x) && x !== 'Assessment') && !labels.includes('Assessment');

/**
 * The change made on a store's graph g, or what stops it. It is null when made, else [kind, what]. The kind is:
 * - 'find' when its target is not in the graph;
 * - 'dangling' when a DELETE would leave a link without its end;
 * - 'record' when it would remove or change a record or a cache. A thing's DELETE sets `links`: the links it removes with it.
 */
function applyChange(store, g, c) {
  const graph = store.graph(g),
    has = (k, labels) => k !== null && labels.every((x) => graph.nodes.get(k).labels.has(x));
  const where = c.kind === 'thing' ? c.thing : `${c.from} ${c.type} ${c.to}`;
  const nodeLabels = (key) => graph.nodes.get(key).labels;
  // a cache is anything WAS_GENERATED_BY an activity that HAD_PLAN a rule (§24, W3C PROV). So is anything made by an
  // unknown activity, one with neither a plan nor an agent associated with it: it fails closed. Work an associated Person or Model made
  // without a plan is ordinary
  const hadPlan = (a) => graph.edges.some((e) => e[1] === 'HAD_PLAN' && e[0] === a);
  // an agent: a Person, Organization, SoftwareAgent or Model, or a Ref that resolves to one. A Ref that names no graph
  // the store holds, or nothing in it, is none
  const isAgentNode = (key) => {
    if (!nodeLabels(key).has('Ref')) return AGENT_LABELS.some((x) => nodeLabels(key).has(x));
    const p = graph.nodes.get(key).props;
    if (typeof p.graph !== 'string' || typeof p.ref !== 'string' || !Object.hasOwn(store.graphs, p.graph)) return false;
    const found = store.find(p.graph, p.ref);
    return found !== null && AGENT_LABELS.some((x) => store.graph(p.graph).nodes.get(found).labels.has(x));
  };
  const hasAgent = (a) => graph.edges.some((e) => e[1] === 'ASSOCIATED_WITH' && e[0] === a && isAgentNode(e[2]));
  const makesCache = (a) => hadPlan(a) || !hasAgent(a);
  if (c.kind === 'thing') {
    const k = store.find(g, c.thing);
    if (!has(k, c.labels)) return ['find', where];
    const labels = graph.nodes.get(k).labels;
    if (RECORD_LABELS.some((x) => labels.has(x))) return ['record', where];
    // an issued document is whatever a delivery delivered
    if (graph.edges.some((e) => e[1] === 'DELIVERED' && e[2] === k && nodeLabels(e[0]).has('Delivery')))
      return ['record', where];
    if (graph.edges.some((e) => e[1] === 'WAS_GENERATED_BY' && e[0] === k && makesCache(e[2])))
      return ['record', where];
    if (c.op.startsWith('set')) {
      if (labels.has('Claim') && Object.keys(c.set).some((x) => CACHE_KEYS.includes(x))) return ['record', where];
      Object.assign(graph.nodes.get(k).props, c.set);
      return null;
    }
    const touching = graph.edges.filter((e) => e[0] === k || e[2] === k);
    // a plan and the generation of a cache are the engine's: not removed with the thing they touch
    if (touching.some((e) => e[1] === 'HAD_PLAN' || (e[1] === 'WAS_GENERATED_BY' && makesCache(e[2]))))
      return ['record', where];
    if (touching.length && c.op === 'delete-thing') return ['dangling', where];
    const idOf = (key) => graph.nodes.get(key).props.id;
    c.links = touching.map((e) => [idOf(e[0]), e[1], idOf(e[2])]);
    graph.edges = graph.edges.filter((e) => !touching.includes(e));
    graph.nodes.delete(k);
    return null;
  }
  const a = store.find(g, c.from),
    b = store.find(g, c.to);
  if (!has(a, c.ends[0]) || !has(b, c.ends[1])) return ['find', where];
  const at = graph.edges.findIndex((e) => e[0] === a && e[1] === c.type && e[2] === b);
  if (at < 0) return ['find', where];
  // a plan, and the generation of a cache, are the engine's part: never removed or changed, whoever the change is by
  if (c.type === 'HAD_PLAN' || (c.type === 'WAS_GENERATED_BY' && makesCache(b))) return ['record', where];
  if (c.op.startsWith('set')) Object.assign(graph.edges[at][3], c.set);
  else graph.edges.splice(at, 1);
  return null;
}

/** Whether a new thing is a claim carrying a cache (likelihood, confidence or status), which is the engine's to make. */
const addsCache = (labels, props) => labels.includes('Claim') && CACHE_KEYS.some((k) => k in props);

module.exports = { splitChangeset, readChange, changeId, applyChange, isRecordAdd, addsCache };
