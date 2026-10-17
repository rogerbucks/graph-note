// §21 joins: the joined result being built, and the claims recorded on it.
'use strict';

const short = (d) => d.split(':')[1];
// An empty join: its nodes and relationships, the documents behind each value and relationship (src, esrc), its
// claims and report rows, and the pairs and paradoxes of claims that contradict.
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
// Adds to the join a contested claim, stated in the documents given, and returns its id. The id is made from the
// subject, what is claimed and the documents, sorted, so the same claim made twice is one; p adds or overrides fields.
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
// Two claim ids in order, so a pair of contradicting claims is written one way whichever was found first.
const sortedPair = (a, b) => (a < b ? [a, b] : [b, a]);

module.exports = { newJ, addClaim, sortedPair };
