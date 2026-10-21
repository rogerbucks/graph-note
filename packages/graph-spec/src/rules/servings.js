// §24 servings: what the serving matrix lets be served, and the rules that a proposal's pins were served to its model.
'use strict';

const { same } = require('../values/times.js');
const { resolve, servingHash } = require('./judgements.js');
const { digitsOf } = require('../hashing/named.js');
const { proposersOf } = require('./proposers.js');

// §24 servings
function mayServe(kind, cls, cond, matrix) {
  const v = (matrix[kind] || {})[cls];
  return v === 'yes' || (v === 'conditional' && !!cond);
}
// §24 H3's rules on judgement graph jg's Servings and proposals, against the destination matrix ({consumer kind:
// {classification: 'yes' | 'conditional' | anything else}}), as [label, ok] pairs; none when it holds neither.
function servedRules(w, jg, matrix) {
  const g = w[jg],
    out = [];
  if (!g.labelled('Serving').length && !g.labelled('Proposal').length) return out;
  const served = new Map();
  for (const p of g.labelled('Proposal'))
    for (const [, , s] of g.out(p, 'USED'))
      if (g.has(s, 'Serving'))
        for (const [, , x, e] of g.out(s, 'SERVED')) (served.get(p) || served.set(p, new Map()).get(p)).set(x, e);
  out.push([
    '§24 H3 rule 1: every pin of a proposal was served to its model — same item, same properties, same hash, same time',
    g.labelled('Proposal').every((p) =>
      g
        .out(p, 'RESTS_ON')
        .filter((e) => g.has(e[2], 'Ref'))
        .every(([, , x, e]) => {
          const s = (served.get(p) || new Map()).get(x);
          return s && ['reads', 'hash', 'as_of'].every((k) => same(s[k], e[k]));
        }),
    ),
  ]);
  out.push([
    '§24 H3 rule 2: no serving crossed its classification — the consumer was allowed every item served',
    g
      .labelled('Serving')
      .every((s) =>
        g
          .out(s, 'SERVED')
          .every(([, , , e]) => mayServe(g.p(s).consumer_kind, e.classification, g.p(s).conditions_met, matrix)),
      ),
  ]);
  out.push([
    '§24 H3 rule 4: every proposal a model generated used a serving — it drafted from what it was shown',
    g.labelled('Proposal').every((p) => {
      const ms = proposersOf(w, g, p, resolve);
      return !ms.some((m) => m.labels.has('Model')) || g.out(p, 'USED').some((e) => g.has(e[2], 'Serving'));
    }),
  ]);
  out.push([
    '§24 H3 rule 5: no serving is edited — each content hash, covering what it served, still matches (rule:serving-hash@1)',
    g.labelled('Serving').every((s) => digitsOf(g.p(s).content_hash) === servingHash(w, jg, s)),
  ]);
  return out;
}

module.exports = { servedRules };
