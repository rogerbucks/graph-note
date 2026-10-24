// The milestones of the GitHub mirror (spec §41, plan_milestones). requirements/waves.json lists the milestones, each
// an outcome one step above the waves, and each wave names its own. The mirror makes them, due on the last day of their
// waves, and files each requirement's issue under its wave's milestone. Every case runs against the in-memory stand-in
// for gh, so no network is touched. The real plan is read too.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { REQUIREMENTS } from '../scripts/check-requirements.mjs';
import { readBoard } from '../scripts/slice-board.mjs';
import { desiredState, readWorkstreams } from '../scripts/github-project-desired.mjs';
import { buildPlan } from '../scripts/github-project-plan.mjs';
import { executePlan, readRemote } from '../scripts/github-project-gh.mjs';
import { keepMilestones, planFiling, planMilestones } from '../scripts/github-project-milestones.mjs';
import { MILESTONE_BANNER, WAVES_FILE, milestoneLines, readWaves } from '../scripts/github-project-waves.mjs';
import { fakeGithub } from './repository/github-project-fake.js';
import { FIXTURE, WAVES, WORKSTREAMS } from './repository/github-project-fixture.js';
import { read } from './repository/repo.js';

const REPO = 'rogerbucks/thoughtknot';
const board = readBoard(FIXTURE);
const MILESTONES = {
  ...WAVES,
  milestones: [
    { title: 'Focus works', about: 'Choosing a thing shows its neighbours.' },
    { title: 'Slice 3 done', about: 'Every rule of slice 3 is proved.' },
  ],
  waves: WAVES.waves.map((w, i) => ({ ...w, milestone: i === 0 ? 'Focus works' : 'Slice 3 done' })),
};
const planOf = (file = MILESTONES) => readWaves(JSON.stringify(file), WORKSTREAMS);
const desiredWith = (file = MILESTONES) => desiredState(board, WORKSTREAMS, [3, 4], planOf(file));
const changed = (change) => {
  const copy = structuredClone(MILESTONES);
  change(copy);
  return copy;
};
const apply = (gh, desired = desiredWith()) =>
  executePlan(gh.run, REPO, buildPlan(desired, readRemote(gh.run, REPO)), { sleep: () => {} });
const issueOf = (gh, id) => gh.hub.issues.find((i) => i.body.includes(`<!-- requirement:${id} -->`));
const milestoneCalls = (gh) => gh.hub.mutations.filter((m) => /\/milestones|issues\/\d+ --method PATCH/.test(m));

describe('the milestones of the waves file', () => {
  test('are read with the waves, each wave naming its own', () => {
    const plan = planOf();
    assert.deepEqual(
      plan.milestones.map((m) => m.title),
      ['Focus works', 'Slice 3 done'],
    );
    assert.deepEqual(
      plan.waves.map((w) => w.milestone),
      ['Focus works', 'Slice 3 done'],
    );
  });

  test('refuse a wave of work that names none, a name that is not one, a milestone with no wave, and a bad list', () => {
    const cases = [
      [(f) => delete f.waves[0].milestone, /Wave 1 · Focus" names no milestone/],
      [(f) => (f.waves[0].milestone = 'Nowhere'), /Nowhere is not a milestone/],
      [(f) => f.milestones.push({ title: 'Empty', about: 'Nothing.' }), /milestone "Empty" holds no wave/],
      [(f) => f.milestones.push({ ...f.milestones[0] }), /two milestones are titled "Focus works"/],
      [(f) => (f.milestones[0].about = ''), /needs an about/],
      [(f) => (f.milestones = []), /at least one/],
      [(f) => (f.waves[0].milestone = 3), /milestone must be a milestone's title/],
    ];
    for (const [change, why] of cases) assert.throws(() => planOf(changed(change)), why);
  });

  test('a file that lists none may not have a wave that names one, and a placeholder wave of no work needs none', () => {
    assert.throws(
      () => planOf(changed((f) => delete f.milestones)),
      /names a milestone, but the waves file lists none/,
    );
    const placeholder = { title: 'Later', start: '2026-12-01', end: '2026-12-02', estimate: true, workstreams: [] };
    assert.equal(planOf(changed((f) => f.waves.push(placeholder))).waves.at(-1).milestone, null);
  });
});

describe('the milestones the mirror keeps', () => {
  test('give each requirement its wave’s milestone, and none to one in no wave', () => {
    const issues = Object.fromEntries(desiredWith().issues.map((i) => [i.id, i.milestone]));
    assert.deepEqual(issues, {
      zoom_out_to_fit: null,
      focus_neighbours: 'Focus works',
      focus_link: 'Focus works',
      done_means_proved: 'Slice 3 done',
      stray_new: 'Slice 3 done',
    });
  });

  test('are due on the last end of their waves, describe themselves, and close once all their issues are closed', () => {
    const [focus, slice] = desiredWith().milestones;
    assert.equal(focus.dueOn, '2026-11-02');
    assert.equal(focus.description, `Choosing a thing shows its neighbours. Wave 1.\n\n${MILESTONE_BANNER}`);
    assert.deepEqual([focus.state, slice.state], ['open', 'open']);
    const both = changed((f) => (f.waves[1].milestone = 'Focus works'));
    both.milestones.pop();
    const [one] = desiredWith(both).milestones;
    assert.deepEqual(
      [one.dueOn, one.description.split('\n')[0]],
      ['2026-11-16', 'Choosing a thing shows its neighbours. Waves 1, 2.'],
    );
    const done = desiredState(board, WORKSTREAMS, [3, 4], planOf(changed((f) => (f.waves[0].workstreams = ['W0']))));
    assert.equal(done.milestones[0].state, 'closed', 'every requirement of W0 in the copy is proved');
  });

  test('without milestones in the plan, the mirror leaves every issue’s milestone alone', () => {
    const desired = desiredState(board, WORKSTREAMS, [3, 4], readWaves(JSON.stringify(WAVES), WORKSTREAMS));
    assert.equal(desired.milestones, undefined);
    assert.ok(desired.issues.every((i) => i.milestone === undefined));
    assert.deepEqual(milestoneLines(desired), []);
  });

  test('are printed with their due day, state and requirements', () => {
    assert.deepEqual(milestoneLines(desiredWith()), [
      'milestone Focus works (due 2026-11-02, open): 1 wave · 2 requirements · 0 proved · 1 part · 1 open',
      'milestone Slice 3 done (due 2026-11-16, open): 1 wave · 2 requirements · 0 proved · 0 part · 2 open',
    ]);
  });
});

describe('the milestones on GitHub', () => {
  test('are made, and every issue filed under its wave’s milestone', () => {
    const gh = fakeGithub();
    assert.deepEqual(apply(gh).warnings, []);
    assert.deepEqual(
      gh.hub.milestones.map((m) => [m.title, m.due_on, m.state]),
      [
        ['Focus works', '2026-11-02T12:00:00Z', 'open'],
        ['Slice 3 done', '2026-11-16T12:00:00Z', 'open'],
      ],
    );
    assert.equal(issueOf(gh, 'focus_link').milestone.title, 'Focus works');
    assert.equal(issueOf(gh, 'stray_new').milestone.title, 'Slice 3 done');
    assert.equal(issueOf(gh, 'zoom_out_to_fit').milestone ?? null, null);
  });

  test('are kept once: a second apply changes nothing', () => {
    const gh = fakeGithub();
    apply(gh);
    const before = milestoneCalls(gh).length;
    apply(gh);
    assert.equal(milestoneCalls(gh).length, before);
  });

  test('follow the plan: a wave re-dated moves the due day, and a wave moved to another milestone moves its issues', () => {
    const gh = fakeGithub();
    apply(gh);
    const moved = changed((f) => {
      f.waves[1].end = '2026-11-20';
      f.waves[1].milestone = 'Focus works';
      f.milestones[1].about = 'Kept for later.';
      f.waves.push({
        title: 'Wave 3 · Later',
        start: '2026-11-21',
        end: '2026-11-22',
        estimate: true,
        workstreams: [],
        milestone: 'Slice 3 done',
      });
    });
    apply(gh, desiredWith(moved));
    const focus = gh.hub.milestones.find((m) => m.title === 'Focus works');
    assert.equal(focus.due_on, '2026-11-20T12:00:00Z');
    assert.equal(issueOf(gh, 'stray_new').milestone.title, 'Focus works');
    assert.match(gh.hub.milestones[1].description, /^Kept for later\. Wave 3\./);
  });

  test('a milestone the waves file does not list is a person’s, and left alone', () => {
    const gh = fakeGithub();
    gh.hub.milestones.push({ number: 1, title: 'Mine', description: 'a person’s', due_on: null, state: 'open' });
    apply(gh);
    assert.deepEqual(gh.hub.milestones[0], {
      number: 1,
      title: 'Mine',
      description: 'a person’s',
      due_on: null,
      state: 'open',
    });
  });

  test('are kept after the board’s values, so a slow or refused milestone never holds back Proof, and without the project too', () => {
    const gh = fakeGithub();
    apply(gh);
    const calls = gh.hub.mutations;
    const lastBoard = calls.findLastIndex((m) => m.includes('graphql'));
    const firstMilestone = calls.findIndex((m) => m.includes('/milestones'));
    assert.ok(firstMilestone > lastBoard, 'every project value is set before the first milestone');
    const alone = fakeGithub();
    executePlan(alone.run, REPO, buildPlan(desiredWith(), readRemote(alone.run, REPO, { project: false })), {
      sleep: () => {},
    });
    assert.equal(alone.hub.milestones.length, 2);
  });

  test('a run files at most its cap of issues, and the next run files the rest', () => {
    const gh = fakeGithub();
    const desired = desiredWith();
    const once = () => {
      const plan = buildPlan(desired, readRemote(gh.run, REPO));
      const known = { ...plan.issues.held };
      return keepMilestones(gh.run, gh.run, REPO, desired, known, plan.milestoneOf, 3);
    };
    apply(gh, desiredState(board, WORKSTREAMS, [3, 4], readWaves(JSON.stringify(WAVES), WORKSTREAMS)));
    assert.deepEqual(once(), { created: 2, updated: 0, filed: 3, left: 1 });
    assert.deepEqual(once(), { created: 0, updated: 0, filed: 1, left: 0 });
  });

  test('refused by GitHub, they leave the issues and the project mirrored, with a warning', () => {
    const gh = fakeGithub();
    gh.hub.milestonesRefused = true;
    const result = apply(gh);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /milestones were not kept: .*403/);
    assert.ok(gh.hub.projects[0].items.length > 0, 'the project was still mirrored');
  });

  test('are planned by title, the due day compared by the day alone', () => {
    const wanted = [
      { title: 'A', description: 'a', dueOn: '2026-11-02', state: 'open' },
      { title: 'B', description: 'b', dueOn: '2026-11-03', state: 'closed' },
      { title: 'C', description: 'c', dueOn: '2026-11-04', state: 'open' },
    ];
    const have = [
      { number: 1, title: 'A', description: 'a\r\n', due_on: '2026-11-02T07:00:00Z', state: 'open' },
      { number: 2, title: 'B', description: 'b', due_on: '2026-11-03T12:00:00Z', state: 'open' },
    ];
    const plan = planMilestones(wanted, have);
    assert.deepEqual(
      plan.create.map((m) => m.title),
      ['C'],
    );
    assert.deepEqual(
      plan.update.map((u) => u.number),
      [2],
    );
  });

  test('file an issue only where its milestone differs, and leave alone one the plan says nothing of', () => {
    const issues = [
      { id: 'a', milestone: 'A' },
      { id: 'b', milestone: null },
      { id: 'c' },
      { id: 'd', milestone: 'A' },
    ];
    const known = { a: { number: 1 }, b: { number: 2 }, c: { number: 3 }, d: { number: 4 } };
    const current = new Map([
      [1, 'A'],
      [2, 'B'],
      [3, 'C'],
    ]);
    assert.deepEqual(planFiling(issues, known, current), [
      { number: 2, milestone: null },
      { number: 4, milestone: 'A' },
    ]);
  });
});

describe('the real plan’s milestones', () => {
  const workstreams = readWorkstreams(read('requirements/workstreams.json'));
  const plan = readWaves(read(WAVES_FILE), workstreams);
  const desired = desiredState(readBoard(read(REQUIREMENTS)), workstreams, [3, 4, 5, 6, 7, 8, 9, 10], plan);

  test('are read without a fault, so every wave of work names one, and a wave added later must too', () => {
    assert.ok(plan.milestones.length > 0);
    assert.ok(plan.waves.filter((w) => w.workstreams.length).every((w) => w.milestone));
  });

  test('give the Obsidian community release (R2) a milestone of its own, and are listed in the order they are due', () => {
    const r2 = plan.waves.find((w) => w.workstreams.includes('R2'));
    assert.equal(plan.waves.filter((w) => w.milestone === r2.milestone).length, 1);
    const due = desired.milestones.map((m) => m.dueOn);
    assert.deepEqual(due, [...due].sort());
  });
});
