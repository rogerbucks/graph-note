// The process the debugger tests step through (editor spec §35). It is a refund of 500, which is refused. A breakpoint
// can sit on the guard that lets small refunds through. Test support only — nothing here ships.
import assert from 'node:assert/strict';
import { fence } from './notes.js';

export const PROCESS = `// graph: refund
(refund:Process {name: 'Refund', amount: 500}),
(asked:State {name: 'Asked', initial: TRUE}),
(checked:State {name: 'Checked'}),
(paid:State {name: 'Paid', final: TRUE}),
(refused:State {name: 'Refused', final: TRUE}),
(owed:Claim {name: 'Owed', likelihood: 'even-chance'}),
(letter:Artefact {name: 'Letter'}),
(desk:Resource {name: 'Desk'}),
(small:Guard {name: 'Small amount', expression: 'amount <= 100'}),
(big:Guard {name: 'Big amount', expression: 'amount > 100'}),
(pay:Transition {name: 'Pay', do: 'send_money'}),
(deny:Transition {name: 'Deny', certainty_of: 'owed', certainty: 'unlikely'}),
(asked)-[:TRANSITION]->(checked),
(pay)-[:FROM]->(checked),
(pay)-[:TO]->(paid),
(pay)-[:GUARDED_BY]->(small),
(deny)-[:FROM]->(checked),
(deny)-[:TO]->(refused),
(deny)-[:GUARDED_BY]->(big),
(refused)-[:SENDS]->(letter),
(deny)-[:USES]->(desk)`;

/** The process with a breakpoint on the small-refund guard, saved in the graph like any thing. */
export const WITH_BREAKPOINT = `${PROCESS},
(on_small:Breakpoint {name: 'On small'}),
(on_small)-[:ON]->(small)`;

export const noteOf = (block) => ['# Refunds', '', fence(block), ''].join('\n');
export const nodeOf = (el, key) => el.querySelectorAll('g.node').find((n) => n.getAttribute('data-key') === key);
/** The lines the debugger's panel says now. */
export const panel = (el) =>
  el
    .querySelector('.thoughtknot-debug')
    .querySelectorAll('.thoughtknot-debug-line')
    .map((l) => l.textContent);

/** The window's timer for Play, run by hand: a wait of two seconds is kept until `tick`; any other runs as ever. */
export function handTimer(env) {
  const win = env.doc.defaultView,
    [set, clear] = [win.setTimeout, win.clearTimeout],
    waiting = new Map();
  let n = 0;
  win.setTimeout = (run, ms) => {
    if (ms !== 2000) return set(run, ms);
    waiting.set(`step ${++n}`, { ms, run });
    return `step ${n}`;
  };
  win.clearTimeout = (handle) => (waiting.has(handle) ? waiting.delete(handle) : clear(handle));
  return {
    get pending() {
      return [...waiting.values()].map((w) => w.ms);
    },
    tick() {
      assert.equal(waiting.size, 1, 'one step waits at a time');
      const [[handle, w]] = waiting;
      waiting.delete(handle);
      w.run();
    },
  };
}
