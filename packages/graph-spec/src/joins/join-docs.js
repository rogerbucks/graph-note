// §21 joins: a join request answered end to end — configuration, normalise, validate, union or merge3, finish.
'use strict';

const { norm } = require('../values/times.js');
const { byKey } = require('../values/order.js');
const { jcs } = require('../hashing/canonical-json.js');
const { pystr } = require('./python-text.js');
const { parseDoc, rawProps, normalise } = require('./normalise.js');
const { RULES } = require('./named-rules.js');
const { validate } = require('./validate.js');
const { union } = require('./union.js');
const { merge3 } = require('./merge3.js');
const { finish } = require('./finish.js');

function configFrom(d) {
  d = d || {};
  const config = {
    maps: d.unit_maps || {},
    time: d.time_restatements || {},
    id_map: d.id_map || {},
    value_maps: (d.vocabulary_maps || []).map((m) => ({ type: m.type, attribute: m.attribute, map: m.map })),
    acyclic: d.acyclic || [],
    at_most_one: (d.at_most_one || []).map((m) => ({ type: m.type, side: m.side, rule: m.rule })),
    vocab: Object.fromEntries(Object.entries(d.vocabulary || {}).map(([k, v]) => [k, new Set(v)])),
    edge_keys: d.identified_by || {},
    contexts: d.guard_cases || {},
  };
  config.constraints = (d.constraints || []).map((c) => [
    c.why,
    'gql' in c ? RULES[c.reference] || null : RULES[c.rule],
  ]); // no engine here: a GQL constraint runs as its named twin
  return config;
}
function joinDocs(q) {
  // q: {docs: [block], base: block|null, config, findings, checks, hold, switches}
  const config = configFrom(q.config),
    log = [],
    sw = new Set(q.switches || []);
  const one = (block, base) => {
    const d = parseDoc(block);
    if (!base) d._raw = rawProps(d);
    normalise(d, log, config, sw.has('base-dates') ? null : base);
    if (!sw.has('validate')) validate(d, log, config);
    return d;
  };
  const base = q.base ? one(q.base) : null,
    docs = q.docs.map((b) => one(b, base)),
    checks = q.checks;
  const joined =
    base && !sw.has('base')
      ? finish(merge3(base, docs[0], docs[1], config, q.hold), config, q.findings || [], checks)
      : finish(union(docs, config), config, q.findings || [], checks);
  const pr = (p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, norm(v)]));
  return {
    rows: log
      .concat(joined.report)
      .map((r) => [r[0], pystr(r[1]), pystr(r[2]), r[4], r[5]])
      .sort(byKey(jcs)),
    claims: Object.fromEntries([...joined.claims].map(([k, c]) => [k, [c.status, c.confidence]])),
    pairs: joined.pairs,
    paradoxes: joined.paradoxes.slice().sort(byKey(jcs)),
    nodes: Object.fromEntries([...joined.nodes].map(([k, n]) => [k, [[...n.labels].sort(), pr(n.props)]])),
    edges: Object.fromEntries(
      [...joined.edges.values()].map(({ key, props }) => [
        jcs([key[0], key[1], norm(key[2]), key[3].map(norm)]),
        pr(props),
      ]),
    ),
  };
}

module.exports = { configFrom, joinDocs };
