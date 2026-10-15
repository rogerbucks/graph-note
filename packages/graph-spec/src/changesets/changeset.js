// §24 H1 change sets: what a model may add and link, applied to a copy of the base graph and checked.
'use strict';

const { norm } = require('../values/times.js');
const { ProfileError } = require('../reader/profile-error.js');
const { Store } = require('../reader/store.js');
const { worldFromStore, canon } = require('../graph/graph.js');
const { latestAssessment, confidenceFromEvidence, claimStatus } = require('../rules/certainty.js');
const { check } = require('../rules/check.js');
const { lint } = require('./dialect-lint.js');
const { splitChangeset, readChange, changeId, applyChange, isRecordAdd, addsCache } = require('./changes.js');

// what stops a DELETE or SET, by kind (applyChange)
const LABELS = {
  find: 'each DELETE and SET finds its one target in the graph (§24)',
  dangling: 'a DELETE leaves no link without its end; DETACH DELETE removes a thing with its links (§24)',
  record: 'it never removes or changes a record or a cache (§24 rule 4)',
};
function changesetHeader(block) {
  const first = block.split('\n').find((line) => line.trim()) || '';
  const m = /^\s*\/\/\s*graph:\s*(\S+)\s*·\s*CHANGE SET\s+(\S+)\s*·\s*against\s+([0-9a-f]{16})\s*·\s*by\s+(\S+)/.exec(
    first,
  );
  return m ? { graph: m[1], id: m[2], against: m[3], by: m[4] } : null;
}
const stateOf = (g) => {
  const pj = (p) => {
    const o = {};
    for (const k of Object.keys(p).sort()) o[k] = norm(p[k]);
    return JSON.stringify(o);
  };
  return [
    new Map([...g.nodes].map(([i, [labels, p]]) => [i, [[...labels].sort().join(':'), pj(p)]])),
    g.edges.map(([s, t, d, p]) => JSON.stringify([s, t, d, pj(p)])),
  ];
};
function refreshSection20(store, name) {
  const g = worldFromStore(store)[name],
    stored = store.graph(name),
    out = [],
    keyOf = new Map([...stored.nodes].map(([k, n]) => [n.props.id, k]));
  for (const [key, rule] of [
    ['likelihood', latestAssessment(g)],
    ['confidence', confidenceFromEvidence(g)],
    ['status', claimStatus(g)],
  ]) {
    for (const [c, v] of rule) {
      const p = stored.nodes.get(keyOf.get(c)).props;
      if (p[key] !== v && !(key === 'confidence' && p.rule)) {
        out.push([c, key, p[key] === undefined ? null : p[key], v]);
        p[key] = v;
      }
    }
  }
  return out;
}
function checkChangeset(base, block, matrix, sw = new Set()) {
  const res = [],
    add = (label, ok) => res.push([label, !!ok]);
  block = block.replace(/\r\n/g, '\n'); // a line ends at LF in the reader; CRLF text is read as LF text
  const h = changesetHeader(block);
  add('the change set names its graph, its id, the state it was made against, and its author', h);
  if (!h) return { results: res, header: null, after: null };
  const parts = splitChangeset(block);
  add(
    'it passes the dialect linter (§24 H1)',
    !lint(parts.additions).length && !parts.changes.some((c) => lint(c.text).length),
  );
  add('only the header says what it was made against and who made it (§24)', parts.basisOk);
  const read = [];
  let refused = false;
  for (const c of parts.changes) {
    try {
      read.push({ ...readChange(c.text), reason: c.reason });
    } catch (e) {
      if (!(e instanceof ProfileError)) throw e;
      refused = true;
    }
  }
  h.changes = refused ? [] : read.map((c) => ({ id: changeId(c), op: c.op, reason: c.reason }));
  // the same change twice would be accepted or rejected as two, though it is one
  if (new Set(h.changes.map((c) => c.id)).size !== h.changes.length) refused = true;
  if (refused) h.changes = [];
  add('each DELETE and SET is its own statement and names exactly one target (§24)', !refused);
  if (refused) return { results: res, header: h, after: null };
  const st = new Store();
  base.forEach((b) => st.apply(b));
  if (!(h.graph in st.graphs)) {
    add(`its graph ${h.graph} is one of the base's`, false);
    return { results: res, header: h, after: null };
  }
  let w = worldFromStore(st);
  const now = canon(w[h.graph]).slice(0, 16);
  add('it was made against the graph as it stands', h.against === now);
  const who = Object.values(w)
    .filter((g) => g.nodes.has(h.by))
    .map((g) => g.nodes.get(h.by)[0]);
  const kind = who.some((labels) => labels.has('Model'))
    ? 'Model'
    : who.some((labels) => labels.has('Person'))
      ? 'Person'
      : null;
  add(`its author ${h.by} is a known person or model`, kind);
  const before = stateOf(w[h.graph]);
  try {
    st.apply(parts.additions);
  } catch (e) {
    if (!(e instanceof ProfileError)) throw e;
    add('it loads', false);
    return { results: res, header: h, after: null };
  }
  const after = stateOf(worldFromStore(st)[h.graph]);
  const count = (a) => a.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map()),
    bc = count(before[1]),
    ac = count(after[1]);
  const gone = [...before[0].keys()].some((i) => !after[0].has(i)) || [...bc].some(([e, n]) => (ac.get(e) || 0) < n);
  const changed = [...before[0]].some(
    ([i, v]) => after[0].has(i) && (after[0].get(i)[0] !== v[0] || after[0].get(i)[1] !== v[1]),
  );
  if (!sw.has('additions-only'))
    add('it only adds — nothing removed, nothing already there changed (§12)', !gone && !changed);
  const newNodes = [...after[0]].filter(([i]) => !before[0].has(i));
  const caches = newNodes.some(([, [labels, props]]) => addsCache(labels.split(':'), JSON.parse(props)));
  add("it adds no cache — a claim's likelihood, confidence and status are the engine's (§24 rule 5)", !caches);
  if (caches) return { results: res, header: h, after: null };
  // a set that is not only additions is not applied further: its DELETEs and SETs would act on a graph it has wrongly changed
  if (read.length && (gone || changed) && !sw.has('additions-only')) return { results: res, header: h, after: null };
  for (const c of read) {
    const stopped = applyChange(st, h.graph, c);
    if (!stopped) continue;
    add(LABELS[stopped[0]], false);
    return { results: res, header: h, after: null };
  }
  if (read.length) {
    for (const label of Object.values(LABELS)) add(label, true);
    h.changes = read.map((c, i) => ({ ...h.changes[i], ...(c.links ? { links: c.links } : {}) }));
  }
  h.refreshes = refreshSection20(st, h.graph);
  w = worldFromStore(st);
  const g = w[h.graph];
  if (kind === 'Model' && !sw.has('model-may-add')) {
    add(
      'a model adds no record and no cache (§24 rule 5)',
      newNodes.every(([, [labels]]) => !isRecordAdd(labels.split(':'))) &&
        // what a delivery delivers is an issued document, a record
        ![...ac].some(([e, n]) => n > (bc.get(e) || 0) && JSON.parse(e)[1] === 'DELIVERED'),
    );
    const by = newNodes
      .filter(([, [labels]]) => labels.split(':').includes('Assessment'))
      .flatMap(([i]) => g.out(i, 'BY').map((e) => e[2]));
    add(
      "a model's assessments are its own",
      by.every((x) => x === h.by),
    );
  }
  for (const [label, ok] of check(w, h.graph, matrix)) add('after it, ' + label, ok);
  return { results: res, header: h, after: canon(g).slice(0, 16) };
}

module.exports = { changesetHeader, checkChangeset };
