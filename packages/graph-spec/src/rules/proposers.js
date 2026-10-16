// Who proposed a Proposal (§23 rule 6, §24 H3 rule 4), as W3C PROV records it: the Proposal is WAS_ATTRIBUTED_TO the agent,
// a Ref to a Model in another graph. For one release the old form is still read, with a warning naming the fix: the
// Proposal WAS_GENERATED_BY an Activity that is ASSOCIATED_WITH the agent. The twin of proposers.py.
'use strict';

/**
 * The proposers of proposal `p` in graph `g`: each as `{ labels, via, id, activity }`, `labels` those of the thing the
 * Ref resolves to (`resolve` is judgements.js's), `via` 'attributed' or 'legacy' (the old form, with its `activity`).
 */
function proposersOf(w, g, p, resolve) {
  const entry = (id, via, activity) => ({ id, via, activity, labels: resolve(w, g.p(id))[1] });
  return [
    ...g
      .out(p, 'WAS_ATTRIBUTED_TO')
      .filter((e) => g.has(e[2], 'Ref'))
      .map((e) => entry(e[2], 'attributed')),
    ...g
      .out(p, 'WAS_GENERATED_BY')
      .filter((e) => g.has(e[2], 'Activity'))
      .flatMap((e) =>
        g
          .out(e[2], 'ASSOCIATED_WITH')
          .filter((x) => g.has(x[2], 'Ref'))
          .map((x) => entry(x[2], 'legacy', e[2])),
      ),
  ];
}

/** The warnings for the old form, sorted: each names the fix. */
function proposerWarnings(w, name, resolve) {
  const g = w[name],
    out = [];
  for (const p of g.labelled('Proposal'))
    for (const x of proposersOf(w, g, p, resolve))
      if (x.via === 'legacy')
        out.push(
          `${p} names its proposer through ASSOCIATED_WITH on its activity ${x.activity}: attribute it with (${p})-[:WAS_ATTRIBUTED_TO]->(${x.id}) instead; the old form is accepted for one release`,
        );
  return out.sort();
}

module.exports = { proposersOf, proposerWarnings };
