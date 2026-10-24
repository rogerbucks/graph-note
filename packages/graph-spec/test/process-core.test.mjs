// The process core and its runs (editor spec §34). The core has eight kinds and flags a ninth. Transitions are links
// that can be promoted to things, and a query walks them. Guards are data. A run's log is the truth, its machines nest
// at any depth, and its running rule can be overridden on the run alone. The cases are in process-core-cases.json, and
// python/graph_spec/tests/test_process_core.py holds the Python library to the same answers.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const C = createRequire(import.meta.url)('../src/graph-spec-check.js');
const { cases } = JSON.parse(readFileSync(new URL('./process-core-cases.json', import.meta.url), 'utf8'));

/** The plain graph of a shared case. */
const graphOf = (s) =>
  new C.Graph(
    new Map(s.nodes.map(([id, labels, props]) => [id, [new Set(labels), { id, ...props }]])),
    s.edges.map(([a, t, b, p]) => [a, t, b, p || {}]),
  );
/** An answer as the cases write it: a graph as its nodes and edges. */
const plain = (v) =>
  v instanceof C.Graph
    ? { nodes: [...v.nodes].map(([id, [l, p]]) => [id, [...l].sort(), p]), edges: v.edges.map((e) => [...e]) }
    : v;
const named = (name) => cases.find((c) => c.name === name);

for (const requirement of [...new Set(cases.map((c) => c.requirement))])
  describe(requirement, () => {
    for (const c of cases.filter((x) => x.requirement === requirement))
      test(c.name, () => {
        assert.deepEqual(JSON.parse(JSON.stringify(plain(C[c.call](graphOf(c.graph), ...c.args)))), c.expected);
      });
  });

describe('what the cases rest on', () => {
  test('the core declares exactly the eight kinds, and a ninth is flagged and kept', () => {
    const c = named('the core declares eight kinds, flags a ninth and keeps view details apart');
    const out = C.coreOfEight(graphOf(c.graph));
    assert.equal(out.kinds.length, 8);
    assert.ok(out.flags.some(([code, id]) => code === 'ninth-kind' && id === 'kpi'));
    assert.ok(Object.hasOwn(out.core, 'kpi'));
    assert.deepEqual(out.view.ship, { x: 10, y: 20 });
    assert.equal(out.core.ship.x, undefined);
  });

  test('a promoted transition joins and can be contested like any thing', () => {
    const c = named('a promoted transition is graph text with from and to links');
    const { lines } = C.promoteTransition(graphOf(c.graph), 'open', 'closed', 't1');
    const states = ['(open:State)', '(closed:State)'];
    const block = (doc, text) =>
      `// graph: flow · document ${doc} · schema s1 · as of 2026-10-01\n${states.concat(text).join('\n')}`;
    const other = lines.map((l) => l.replace("comment: 'needs a note'", "comment: 'no note needed'"));
    const out = C.meshJoin({ docs: [block('doc:a', lines), block('doc:b', other)], config: {}, findings: [] });
    assert.equal(out.standing.t1, 'contested');
    assert.ok(out.conflicts.some((x) => x.subject === 't1' && x.about === 'comment'));
  });

  test('a guard naming a function version runs that version, and a missing version is refused', () => {
    const c = named('a guard naming a function shows its name and version');
    const guard = C.guardOf(graphOf(c.graph), 't3');
    const functions = { credit_check: { 1: () => false, 2: (ctx) => ctx.score > 600 } };
    assert.equal(C.guardAllows(guard, { score: 700 }, functions), true);
    assert.equal(guard.shown, 'credit_check v2');
    assert.throws(() => C.guardAllows(guard, { score: 700 }, { credit_check: { 1: () => true } }), /version 2/);
    const expression = C.guardOf(graphOf(c.graph), 't2');
    assert.equal(C.guardAllows(expression, { amount: 12 }), true);
  });

  test("deleting a run's current-state link makes it again, the same, from the log", () => {
    const whole = graphOf(named('the current states come from the log').graph);
    const lost = graphOf(named('a lost current link is made again from the log').graph);
    const again = C.refreshCurrent(lost, 'r');
    assert.deepEqual(
      again.out('r', 'CURRENT').map((e) => e[2]),
      whole.out('r', 'CURRENT').map((e) => e[2]),
    );
  });

  test("a sub-machine's events are logged under its parent state, at any depth", () => {
    const g = graphOf(named('entering a state enters each inner machine, logged under its parent').graph);
    const entered = C.enterState(g, 'r', 'order');
    assert.deepEqual(
      entered.map((e) => [e.state, e.under]),
      [
        ['order', null],
        ['payment', 'order'],
        ['card', 'payment'],
      ],
    );
    const after = C.withEntries(g, 'r', entered);
    assert.deepEqual(C.currentOf(after, 'r'), ['order', 'payment', 'card']);
    const moved = C.moveRun(after, 'r', 'card', 'card-ok');
    assert.ok(moved.every((e) => e.under === 'payment'));
  });

  test('a loop of states containing each other is refused', () => {
    const g = graphOf({
      nodes: [
        ['a', ['State'], { initial: true }],
        ['b', ['State'], { initial: true }],
      ],
      edges: [
        ['a', 'CONTAINS', 'b'],
        ['b', 'CONTAINS', 'a'],
      ],
    });
    assert.throws(() => C.enterState(g, 'r', 'a'), /loop/);
  });

  test("a run's override is recorded on the run, and the process default is unchanged", () => {
    const g = graphOf(named('a run with no override follows its process default').graph);
    const after = C.overrideRunningRule(g, 'r', 'all-enabled');
    assert.deepEqual(C.runningRuleOf(after, 'r'), {
      rule: 'all-enabled',
      from: 'run',
      process_default: 'first-match',
    });
    assert.equal(after.p('p').running_rule, 'first-match');
    assert.throws(() => C.overrideRunningRule(g, 'r', 'random'), /running rule/);
  });
});
