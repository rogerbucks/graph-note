// §21 joins: the joined result being built, and the claims recorded on it.
'use strict';

const short = (d) => d.split(':')[1];
function newJ() {
  return {
    nodes: new Map(),
    edges: new Map(),
    src: new Map(),
    esrc: new Map(),
    claims: new Map(),
    report: [],
    pairs: [],
    paradoxes: [],
  };
}
function addClaim(joined, subject, what, docs, about, p) {
  const ds = docs.slice().sort(),
    cid = `claim:join/${subject}/${what}@${ds.map(short).join('+')}`;
  joined.claims.set(
    cid,
    Object.assign(
      {
        id: cid,
        likelihood: 'cannot-judge',
        confidence: 'low',
        status: 'contested',
        rule: 'rule:join@1',
        stated_in: ds.join(' '),
        _about: about,
        _docs: ds,
      },
      p || {},
    ),
  );
  return cid;
}
const sortedPair = (a, b) => (a < b ? [a, b] : [b, a]);

module.exports = { newJ, addClaim, sortedPair };
