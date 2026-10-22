// Views as scaffolds (editor spec §36, views_as_scaffolds; provisional): view-scaffold.ts. A view says what a complete
// version needs. Each field a thing lacks is drawn as a prompt beside it. Filling one writes it into the graph.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VIEW_NEEDS, fillGap, gapsOf, scaffoldMarks } from '../src/view-types/view-scaffold.ts';
import { VIEW_DRAWERS } from '../src/view-types/view-types.ts';
import { planMarks } from '../src/view-types/plan-view.ts';
import { drawMarksOf } from '../src/drawing-marks.ts';

const SPACE = { width: 800, height: 300 };
const thing = (key, dates = {}, kinds = ['Task']) => {
  const map = new Map(Object.entries(dates));
  return { key, text: key.toUpperCase(), kinds, ...(map.size ? { date: [...map.values()][0], dates: map } : {}) };
};
const shape = {
  things: [
    thing('build', { start: '2026-11-02', end: '2026-11-06' }),
    thing('test', { start: '2026-11-07' }),
    thing('ship', { start: '2026-11-08', due: '2026-11-09' }),
    thing('launch'),
  ],
  links: [],
};
const prompts = (marks) => marks.filter((m) => m.style === 'prompt');

test('a view says what a complete version needs, and finds what each thing lacks', () => {
  assert.deepEqual(
    VIEW_NEEDS.plan.map((n) => n.field),
    ['start', 'end'],
  );
  assert.deepEqual(gapsOf(shape.things, VIEW_NEEDS.plan), [
    { thing: 'test', field: 'end' },
    { thing: 'launch', field: 'start' },
    { thing: 'launch', field: 'end' },
  ]);
  const only = [{ field: 'cost', kinds: ['Spend'] }];
  assert.deepEqual(gapsOf([...shape.things, thing('fee', {}, ['Spend'])], only), [{ thing: 'fee', field: 'cost' }]);
});

test('the plan asks only for what it cannot read from the dates a thing has, as it draws them', () => {
  const things = [
    thing('due_only', { due: '2026-11-09' }),
    thing('one_day', { launch: '2026-11-10' }),
    thing('go_live', { start: '2026-11-02', live: '2026-11-12' }),
  ];
  assert.deepEqual(gapsOf(things, VIEW_NEEDS.plan), [{ thing: 'one_day', field: 'end' }]);
});

test('the plan asks no dates of a kind no dated thing is, but asks every thing when none has a date yet', () => {
  const ada = thing('ada', {}, ['Person']);
  assert.deepEqual(gapsOf([thing('build', { start: '2026-11-02', end: '2026-11-06' }), ada], VIEW_NEEDS.plan), []);
  assert.deepEqual(
    gapsOf([thing('build'), ada], VIEW_NEEDS.plan).map((g) => g.thing),
    ['build', 'build', 'ada', 'ada'],
  );
});

test('the plan view draws what is there, with each gap as a prompt beside its thing, inside the space', () => {
  const given = { shape, space: SPACE };
  const marks = drawMarksOf(VIEW_DRAWERS.plan(given), SPACE);
  assert.ok(Array.isArray(marks), String(marks));
  assert.equal(marks.length, planMarks(given).length + 3, 'the plan, then a prompt for each gap');
  assert.deepEqual(
    prompts(marks).map((m) => [m.id, m.of, m.name]),
    [
      ['prompt\ntest\nend', 'test', 'Add end for TEST'],
      ['prompt\nlaunch\nstart', 'launch', 'Add start for LAUNCH'],
      ['prompt\nlaunch\nend', 'launch', 'Add end for LAUNCH'],
    ],
  );
  const bar = marks.find((m) => m.id === 'test');
  const [p] = prompts(marks);
  assert.ok(p.x > bar.x + bar.width && p.y > bar.y, 'beside the thing’s bar');
  const [, a, b] = prompts(marks);
  assert.ok(b.y > a.y, 'two prompts for one thing are stacked');
});

test('a view with nothing missing draws no prompt', () => {
  const full = { things: shape.things.slice(0, 1), links: [] };
  const drawn = planMarks({ shape: full, space: SPACE });
  assert.equal(scaffoldMarks({ shape: full, space: SPACE }, drawn, VIEW_NEEDS.plan), drawn);
});

test('filling a prompt writes the field into the graph, so filling a gap is capture', () => {
  const block = "// graph: work\n(test:Task {name: 'Test', start: DATE '2026-11-07'}),\n(launch:Task {name: 'Launch'})";
  const filled = fillGap(block, 'work', { thing: 'launch', field: 'start' }, "DATE '2026-11-10'");
  assert.deepEqual(filled, {
    ok: true,
    text: "// graph: work\n(test:Task {name: 'Test', start: DATE '2026-11-07'}),\n(launch:Task {name: 'Launch', start: DATE '2026-11-10'})",
  });
  assert.equal(fillGap(block, 'work', { thing: 'nobody', field: 'start' }, "DATE '2026-11-10'").ok, false);
});
