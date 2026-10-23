// A text merge checked by the meaning-level join (editor spec §30, same_join_every_author). A sync or a version tool
// can merge two edits of one note by its text. So it can pick one value where the two edits disagree. That pick is never
// the decision. The two edits are joined over their base by the §21 join, as any author's edits are. Each value the
// merged text holds where the join left a dispute is reported as picked, for a person to decide.
//
// It follows python/graph_spec/src/graphspec/engine/mesh/after_text_merge.py, and the shared cases hold both alike.
'use strict';

const { norm } = require('../values/times.js');
const { jcs } = require('../hashing/canonical-json.js');
const { joinedOf } = require('../joins/join-docs.js');
const { parseDoc } = require('../joins/normalise.js');

const same = (a, b) => jcs(norm(a)) === jcs(norm(b));

// The two edits joined over their base, and the merged text read against that join. Gives the claims the join left
// contested. Gives each value the merged text picked among them: its thing, its property, the value, the claim it
// matches and the claims it passed over. settled is true only when the join left nothing in dispute.
function afterTextMerge({ base, ours, theirs, merged, config = {} }) {
  const { joined } = joinedOf({ docs: [ours, theirs], base, config });
  const contested = [...joined.claims.values()].filter((c) => c.status === 'contested');
  const nodes = parseDoc(merged).nodes;
  const bySlot = new Map();
  for (const c of contested) {
    if (c.claimed_property === undefined) continue;
    const slot = `${c._about[0][1]}\u0000${c.claimed_property}`;
    (bySlot.get(slot) ?? bySlot.set(slot, []).get(slot)).push(c);
  }
  const picked = [];
  for (const claims of bySlot.values()) {
    const subject = claims[0]._about[0][1],
      about = claims[0].claimed_property,
      props = nodes.get(subject)?.props;
    if (!props || !(about in props)) continue;
    const hit = claims.find((c) => same(c.claimed_value, props[about]));
    if (!hit) continue;
    const over = claims
      .filter((c) => c !== hit)
      .map((c) => c.id)
      .sort();
    picked.push({ subject, about, value: norm(props[about]), claim: hit.id, over });
  }
  picked.sort((a, b) => (`${a.subject}\u0000${a.about}` < `${b.subject}\u0000${b.about}` ? -1 : 1));
  return { contested: contested.map((c) => c.id).sort(), picked, settled: contested.length === 0 };
}

module.exports = { afterTextMerge };
