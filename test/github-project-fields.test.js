// The project fields of the GitHub mirror that are not a single choice, each derived and never authored: Closed on (from
// each issue's closedAt), Wave (an iteration field, from the waves plan) and Order (a number, from the same plan), and
// the rule Started on is set by. Every case runs against the in-memory stand-in for gh (test/repository/github-project-
// fake.js), so no network is touched. Editor spec §12, requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../scripts/slice-board.mjs';
import { desiredState, idOfBody } from '../scripts/github-project-desired.mjs';
import { buildPlan, formatPlan } from '../scripts/github-project-plan.mjs';
import { executePlan, readRemote } from '../scripts/github-project-gh.mjs';
import {
  dayOf,
  iterationConfig,
  typedDiffers,
  typedMutation,
  valueInput,
  itemValueMutation,
} from '../scripts/github-project-fields.mjs';
import { readWaves } from '../scripts/github-project-waves.mjs';
import { fakeGithub } from './repository/github-project-fake.js';
import { FIXTURE, WAVES, WORKSTREAMS } from './repository/github-project-fixture.js';

const REPO = 'rogerbucks/graph-note';
const board = readBoard(FIXTURE);
const planOf = (waves = WAVES) => readWaves(JSON.stringify(waves), WORKSTREAMS);
const desiredFor = (waves = null) => desiredState(board, WORKSTREAMS, [3, 4], waves && planOf(waves));
const apply = (gh, desired = desiredFor()) => {
  const plan = buildPlan(desired, readRemote(gh.run, REPO));
  executePlan(gh.run, REPO, plan, { sleep: () => {} });
  return plan;
};
const issueOf = (gh, id) => gh.hub.issues.find((i) => idOfBody(i.body) === id);
const itemOf = (gh, id) => gh.hub.projects[0].items.find((i) => i.number === issueOf(gh, id).number);
const valueOf = (gh, id, field) => itemOf(gh, id).values[field];
const fieldOf = (gh, name) => gh.hub.projects[0].fields.find((f) => f.name === name);
const quiet = (gh) => {
  gh.hub.mutations.length = 0;
};
const withWaves = (change) => {
  const copy = structuredClone(WAVES);
  change(copy.waves);
  return copy;
};
/** The desired state with one requirement proved now, or no longer proved, as the copy would say. */
const proving = (desired, id, proved) => ({
  ...desired,
  issues: desired.issues.map((i) =>
    i.id !== id
      ? i
      : {
          ...i,
          status: proved ? 'proved' : 'part',
          state: proved ? 'closed' : 'open',
          labels: i.labels.map((l) => (l.startsWith('status:') ? `status:${proved ? 'proved' : 'part'}` : l)).sort(),
        },
  ),
});

describe('Closed on', () => {
  test('is a date field, made by the first apply, and set on an issue closed by it to the day GitHub closed it', () => {
    const gh = fakeGithub({ now: '2026-10-14T22:15:00Z' });
    apply(gh);
    assert.equal(fieldOf(gh, 'Closed on').dataType, 'DATE');
    assert.equal(valueOf(gh, 'zoom_out_to_fit', 'Closed on'), '2026-10-14');
    assert.equal(valueOf(gh, 'focus_link', 'Closed on'), undefined);
  });

  test('is set on close, from the issue’s closedAt', () => {
    const gh = fakeGithub();
    apply(gh);
    gh.hub.now = '2026-10-20T08:00:00Z';
    quiet(gh);
    apply(gh, proving(desiredFor(), 'focus_neighbours', true));
    assert.equal(issueOf(gh, 'focus_neighbours').state, 'CLOSED');
    assert.equal(valueOf(gh, 'focus_neighbours', 'Closed on'), '2026-10-20');
  });

  test('is set for an issue closed before the field existed, from when it was closed', () => {
    const gh = fakeGithub();
    apply(gh);
    const project = gh.hub.projects[0];
    project.fields = project.fields.filter((f) => f.name !== 'Closed on');
    for (const item of project.items) delete item.values['Closed on'];
    issueOf(gh, 'zoom_out_to_fit').closedAt = '2026-09-01T10:00:00Z';
    quiet(gh);
    apply(gh);
    assert.equal(valueOf(gh, 'zoom_out_to_fit', 'Closed on'), '2026-09-01');
    assert.ok(gh.hub.mutations.every((m) => /createProjectV2Field Closed on$|ProjectV2ItemFieldValue/.test(m)));
  });

  test('is cleared on reopen', () => {
    const gh = fakeGithub();
    apply(gh);
    quiet(gh);
    apply(gh, proving(desiredFor(), 'zoom_out_to_fit', false));
    assert.equal(issueOf(gh, 'zoom_out_to_fit').state, 'OPEN');
    assert.equal(valueOf(gh, 'zoom_out_to_fit', 'Closed on'), undefined);
    assert.ok(gh.hub.mutations.some((m) => m.includes('clearProjectV2ItemFieldValue')));
  });

  test('is unchanged when already right: a second apply sets nothing', () => {
    const gh = fakeGithub();
    apply(gh);
    quiet(gh);
    apply(gh);
    assert.deepEqual(gh.hub.mutations, []);
  });

  test('is put right when someone changed it, as it is derived and never authored', () => {
    const gh = fakeGithub();
    apply(gh);
    itemOf(gh, 'zoom_out_to_fit').values['Closed on'] = '2020-01-01';
    quiet(gh);
    const plan = apply(gh);
    assert.match(formatPlan(plan), /set zoom_out_to_fit Closed on: 2020-01-01 → 2026-10-15/);
    assert.equal(valueOf(gh, 'zoom_out_to_fit', 'Closed on'), '2026-10-15');
  });

  test('is the day in UTC of the time GitHub gives, and none for no time', () => {
    assert.equal(dayOf('2026-10-14T23:30:00-02:00'), '2026-10-15');
    assert.equal(dayOf('2026-10-14T23:30:00Z'), '2026-10-14');
    assert.equal(dayOf(null), null);
    assert.equal(dayOf('yesterday'), null);
  });
});

describe('Wave and Order, from the waves plan', () => {
  test('Wave is an iteration field with one iteration for each wave, with its dates; Order a number field', () => {
    const gh = fakeGithub();
    apply(gh, desiredFor(WAVES));
    const wave = fieldOf(gh, 'Wave');
    assert.equal(wave.dataType, 'ITERATION');
    assert.deepEqual(
      wave.iterations.map(({ title, startDate, duration }) => [title, startDate, duration]),
      [
        ['Wave 1 · Focus · est.', '2026-10-20', 14],
        ['Wave 2 · Slice end', '2026-11-03', 14],
      ],
    );
    assert.equal(fieldOf(gh, 'Order').dataType, 'NUMBER');
  });

  test('each requirement takes its wave and Order; one whose workstream is in no wave takes neither', () => {
    const gh = fakeGithub();
    apply(gh, desiredFor(WAVES));
    assert.deepEqual(
      ['focus_neighbours', 'focus_link', 'done_means_proved', 'stray_new'].map((id) => [
        valueOf(gh, id, 'Wave'),
        valueOf(gh, id, 'Order'),
      ]),
      [
        ['Wave 1 · Focus · est.', 10101],
        ['Wave 1 · Focus · est.', 10102],
        ['Wave 2 · Slice end', 20101],
        ['Wave 2 · Slice end', 20102],
      ],
    );
    assert.deepEqual(
      [valueOf(gh, 'zoom_out_to_fit', 'Wave'), valueOf(gh, 'zoom_out_to_fit', 'Order')],
      [undefined, undefined],
    );
  });

  test('a second apply of the same plan changes nothing', () => {
    const gh = fakeGithub();
    apply(gh, desiredFor(WAVES));
    quiet(gh);
    apply(gh, desiredFor(WAVES));
    assert.deepEqual(gh.hub.mutations, []);
  });

  test('a reordered plan moves Order and Wave on the items, and leaves the iterations, whose dates did not change', () => {
    const gh = fakeGithub();
    apply(gh, desiredFor(WAVES));
    quiet(gh);
    const swapped = withWaves((w) => {
      [w[0].workstreams, w[1].workstreams] = [w[1].workstreams, w[0].workstreams];
    });
    apply(gh, desiredFor(swapped));
    assert.deepEqual(
      [valueOf(gh, 'stray_new', 'Order'), valueOf(gh, 'stray_new', 'Wave')],
      [10102, 'Wave 1 · Focus · est.'],
    );
    assert.deepEqual(
      [valueOf(gh, 'focus_link', 'Order'), valueOf(gh, 'focus_link', 'Wave')],
      [20102, 'Wave 2 · Slice end'],
    );
    assert.ok(gh.hub.mutations.every((m) => /ItemFieldValue/.test(m)));
  });

  test('new dates set the iterations again, each kept by its id, so the items keep their wave', () => {
    const gh = fakeGithub();
    apply(gh, desiredFor(WAVES));
    const ids = fieldOf(gh, 'Wave').iterations.map((i) => i.id);
    quiet(gh);
    apply(gh, desiredFor(withWaves((w) => (w[1].end = '2026-11-30'))));
    assert.deepEqual(
      gh.hub.mutations.filter((m) => !/ItemFieldValue/.test(m)),
      ['api graphql --input - updateProjectV2Field Wave'],
    );
    const kept = fieldOf(gh, 'Wave').iterations.map((i) => i.id);
    assert.deepEqual(kept, ids);
    assert.equal(fieldOf(gh, 'Wave').iterations[1].duration, 28);
    assert.equal(valueOf(gh, 'stray_new', 'Wave'), 'Wave 2 · Slice end');
  });

  test('a wave renamed is a new iteration: its items lose their Wave and the same run gives it them again', () => {
    const gh = fakeGithub();
    apply(gh, desiredFor(WAVES));
    quiet(gh);
    const firm = withWaves((w) => (w[0].estimate = false));
    apply(gh, desiredFor(firm));
    assert.equal(valueOf(gh, 'focus_link', 'Wave'), 'Wave 1 · Focus');
    assert.equal(valueOf(gh, 'stray_new', 'Wave'), 'Wave 2 · Slice end');
    quiet(gh);
    apply(gh, desiredFor(firm));
    assert.deepEqual(gh.hub.mutations, [], 'and the next run finds nothing to do');
  });

  test('a workstream taken out of every wave clears the Wave and Order of its requirements', () => {
    const gh = fakeGithub();
    apply(gh, desiredFor(WAVES));
    quiet(gh);
    apply(gh, desiredFor(withWaves((w) => (w[1].workstreams = []))));
    assert.deepEqual([valueOf(gh, 'stray_new', 'Wave'), valueOf(gh, 'stray_new', 'Order')], [undefined, undefined]);
    assert.equal(valueOf(gh, 'focus_link', 'Order'), 10102);
  });

  test('a field already named Wave that is not an iteration field is refused, never changed', () => {
    const gh = fakeGithub();
    apply(gh);
    gh.run(
      ['api', 'graphql', '--input', '-'],
      JSON.stringify({
        query: 'mutation { createProjectV2Field }',
        variables: { project: gh.hub.projects[0].id, name: 'Wave', type: 'TEXT' },
      }),
    );
    assert.throws(() => apply(gh, desiredFor(WAVES)), /field Wave is a TEXT field, not ITERATION/);
  });

  test('the configuration sent keeps an existing iteration by its id where its title matches', () => {
    const config = iterationConfig(
      [
        { title: 'A', startDate: '2026-10-20', duration: 14 },
        { title: 'B', startDate: '2026-11-03', duration: 7 },
      ],
      [{ id: 'it_a', title: 'A', startDate: '2026-10-01', duration: 14 }],
    );
    assert.deepEqual(config, {
      startDate: '2026-10-20',
      duration: 14,
      iterations: [
        { id: 'it_a', title: 'A', startDate: '2026-10-20', duration: 14 },
        { title: 'B', startDate: '2026-11-03', duration: 7 },
      ],
    });
  });

  test('the update sent for the Wave field holds only the schema’s keys: an iteration’s id, title, start and length', () => {
    const iterations = [{ title: 'A', startDate: '2026-10-20', duration: 14 }];
    const remote = { Wave: { id: 'F_wave', type: 'ITERATION', iterations: [{ id: 'it_a', ...iterations[0] }] } };
    const sent = typedMutation('P_1', { name: 'Wave', type: 'ITERATION', create: false, iterations }, remote);
    assert.deepEqual(Object.keys(sent.variables.iterations).sort(), ['duration', 'iterations', 'startDate']);
    assert.deepEqual(Object.keys(sent.variables.iterations.iterations[0]).sort(), [
      'duration',
      'id',
      'startDate',
      'title',
    ]);
  });

  test('an input key the schema does not hold is refused by the stand-in, as GitHub refuses one, and an id is taken', () => {
    const gh = fakeGithub();
    apply(gh);
    const send = (iteration) =>
      gh.run(
        ['api', 'graphql', '--input', '-'],
        JSON.stringify({
          query: 'mutation { createProjectV2Field }',
          variables: {
            project: gh.hub.projects[0].id,
            name: 'Extra',
            type: 'ITERATION',
            iterations: { startDate: '2026-10-20', duration: 7, iterations: [iteration] },
          },
        }),
      );
    assert.throws(
      () => send({ title: 'A', startDate: '2026-10-20', duration: 7, colour: 'RED' }),
      /ProjectV2Iteration' doesn't accept argument 'colour'/,
    );
    send({ id: 'it_x', title: 'A', startDate: '2026-10-20', duration: 7 });
    assert.equal(fieldOf(gh, 'Extra').iterations[0].id, 'it_x');
  });
});

describe('the rule each value follows', () => {
  test('Started on is set only where there is none, cleared by null, and left by undefined', () => {
    assert.equal(typedDiffers('Started on', null, '2026-10-15'), true);
    assert.equal(typedDiffers('Started on', '2026-10-01', '2026-10-15'), false, 'the first pull request’s day is kept');
    assert.equal(typedDiffers('Started on', '2026-10-01', null), true);
    assert.equal(typedDiffers('Started on', null, null), false);
    assert.equal(typedDiffers('Started on', '2026-10-01', undefined), false);
  });

  test('Order and the dates follow the plan and the issues exactly', () => {
    assert.equal(typedDiffers('Order', 10101, 10101), false);
    assert.equal(typedDiffers('Order', 10101, 10102), true);
    assert.equal(typedDiffers('Closed on', '2026-10-01', '2026-10-02'), true);
  });

  test('a value is given as the one key of its type, and cleared with null', () => {
    const wave = { type: 'ITERATION', iterations: [{ id: 'it_1', title: 'Wave 1' }] };
    const select = { options: [{ id: 'o_1', name: 'Merged' }] };
    assert.deepEqual(valueInput('Wave', wave, 'Wave 1'), { iterationId: 'it_1' });
    assert.deepEqual(valueInput('Order', { type: 'NUMBER' }, 10101), { number: 10101 });
    assert.deepEqual(valueInput('Closed on', { type: 'DATE' }, '2026-10-15'), { date: '2026-10-15' });
    assert.deepEqual(valueInput('Build status', select, 'Merged'), { singleSelectOptionId: 'o_1' });
    assert.equal(valueInput('Closed on', { type: 'DATE' }, null), null);
    assert.throws(() => valueInput('Wave', wave, 'Wave 9'), /no iteration Wave 9/);
    assert.throws(() => valueInput('Build status', select, 'Nope'), /no option Nope/);
  });

  test('a value is set or cleared by the item-value mutations, with only the variables they take', () => {
    const date = { id: 'f_1', type: 'DATE' };
    const set = itemValueMutation('P', 'I', 'Closed on', date, '2026-10-15');
    assert.match(set.query, /updateProjectV2ItemFieldValue/);
    assert.deepEqual(set.variables, { project: 'P', item: 'I', field: 'f_1', value: { date: '2026-10-15' } });
    const clear = itemValueMutation('P', 'I', 'Closed on', date, null);
    assert.match(clear.query, /clearProjectV2ItemFieldValue/);
    assert.deepEqual(clear.variables, { project: 'P', item: 'I', field: 'f_1' });
  });
});
