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
const { withinJoinDocuments, withinJoinItems } = require('../reader/limits.js');

// A join configuration from the declared data in the suite (spec §17), each part empty when not given. A constraint
// written in GQL runs as its named twin in RULES, or is null, which the check refuses: there is no engine here.
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
// A join request answered end to end. Each document is read, normalised and validated, then joined, and finished.
// The join is merge3 of the first two over the base when there is one, union otherwise. The answer's rows, claims,
// pairs, paradoxes, nodes and relationships are sorted and written as JSON values. That is to compare with the Python
// library's. Switches turn single steps off ('base-dates', 'validate', 'base').
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
  // a join past its limits is refused: too many documents before any is read, too much in all before the join
  withinJoinDocuments(q.docs.length + (q.base ? 1 : 0));
  const base = q.base ? one(q.base) : null,
    docs = q.docs.map((b) => one(b, base)),
    checks = q.checks;
  withinJoinItems([base, ...docs].reduce((n, d) => n + (d ? d.nodes.size + d.raw_edges.length : 0), 0));
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
