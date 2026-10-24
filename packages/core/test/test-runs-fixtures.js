// What the test-run tests share (editor spec §35): a small refund process, written as GQL as a note holds it. Test
// support only — nothing here ships.
import gs from '@thoughtknot/graph-spec';

/** Asked, then checked, then paid (a small amount, with a side effect and a certainty change) or refused (a big one). */
export const REFUND = `// graph: refund
(refund:Process {name: 'Refund', running_rule: 'first-match'}),
(asked:State {name: 'Asked', initial: TRUE}),
(checked:State {name: 'Checked'}),
(paid:State {name: 'Paid', final: TRUE}),
(refused:State {name: 'Refused', final: TRUE}),
(owed:Claim {name: 'The customer is owed', likelihood: 'even-chance'}),
(receipt:Artefact {name: 'Receipt'}),
(till:Resource {name: 'Till'}),
(small:Guard {expression: 'amount <= 100'}),
(big:Guard {expression: 'amount > 100'}),
(pay:Transition {name: 'Pay', do: 'send_money', certainty_of: 'owed', certainty: 'very-likely'}),
(deny:Transition {name: 'Deny', decision: 'refuse'}),
(asked)-[:TRANSITION]->(checked),
(pay)-[:FROM]->(checked),
(pay)-[:TO]->(paid),
(pay)-[:GUARDED_BY]->(small),
(deny)-[:FROM]->(checked),
(deny)-[:TO]->(refused),
(deny)-[:GUARDED_BY]->(big),
(checked)-[:USES]->(receipt),
(pay)-[:USES]->(till)`;

/** The graph a GQL text holds, read as the graph spec library reads it. */
export const graphOf = (text) => Object.values(gs.worldFromStore(gs.read([text])))[0];

/** The refund process with more lines added. */
export const refundWith = (...lines) => graphOf([REFUND, ...lines].join(',\n'));

/** A graph that changes when told to, as a live note does. */
export function liveGraph(text = REFUND) {
  let g = graphOf(text);
  return {
    read: () => g,
    set: (next) => (g = typeof next === 'string' ? graphOf(next) : next),
  };
}
