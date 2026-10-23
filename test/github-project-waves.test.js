// The waves plan of the GitHub mirror. requirements/waves.json lists the waves in order. Each wave has its workstreams
// in order, and planned dates marked as estimates. The mirror derives each requirement's Wave and Order from it. Pure:
// no network. The real plan is read too, against the real requirements copy and workstreams file. A wave planned
// again keeps its earlier plan, and a workstream its size (spec §41, plan_rebaselined).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { REQUIREMENTS } from '../scripts/check-requirements.mjs';
import { readBoard } from '../scripts/slice-board.mjs';
import { desiredState, readWorkstreams } from '../scripts/github-project-desired.mjs';
import { WAVES_FILE, iterationsOf, readWaves, waveLines } from '../scripts/github-project-waves.mjs';
import { mirror } from '../scripts/github-project.mjs';
import { fakeGithub } from './repository/github-project-fake.js';
import { FIXTURE, WAVES, WORKSTREAMS } from './repository/github-project-fixture.js';
import { read } from './repository/repo.js';

const board = readBoard(FIXTURE);
const planOf = (waves = WAVES) => readWaves(JSON.stringify(waves), WORKSTREAMS);
const desiredWith = (waves = WAVES) => desiredState(board, WORKSTREAMS, [3, 4], planOf(waves));
const byId = (desired) => Object.fromEntries(desired.issues.map((i) => [i.id, i]));
const withWaves = (change) => {
  const copy = structuredClone(WAVES);
  change(copy.waves);
  return copy;
};

describe('reading the waves file', () => {
  test('gives the waves in order, each with its title, dates, estimate mark and workstreams', () => {
    assert.deepEqual(
      planOf().waves.map((w) => [w.title, w.start, w.end, w.estimate, w.workstreams]),
      [
        ['Wave 1 · Focus', '2026-10-20', '2026-11-02', true, ['W1']],
        ['Wave 2 · Slice end', '2026-11-03', '2026-11-16', false, ['S3']],
      ],
    );
  });

  test('refuses a file that is not a plan, naming what is wrong', () => {
    const refused = [
      ['not json', /not JSON/],
      [JSON.stringify([]), /waves/],
      [JSON.stringify({ waves: [] }), /at least one wave/],
    ];
    for (const [text, why] of refused) assert.throws(() => readWaves(text, WORKSTREAMS), why);
  });

  test('refuses a wave with no title, a title twice, or a workstream the workstreams file does not hold', () => {
    const cases = [
      [(w) => (w[0].title = ''), /title/],
      [(w) => (w[1].title = w[0].title), /two waves are titled/],
      [(w) => w[0].workstreams.push('W99'), /W99.*not a workstream/],
    ];
    for (const [change, why] of cases) assert.throws(() => planOf(withWaves(change)), why);
  });

  test('refuses a workstream in two waves, so each requirement has one place in the order', () => {
    assert.throws(() => planOf(withWaves((w) => w[1].workstreams.push('W1'))), /W1 is in two waves/);
  });

  test('refuses a date that is not a day, an end before its start, an estimate mark that is not true or false, and waves out of order', () => {
    const cases = [
      [(w) => (w[0].start = '20 Oct 2026'), /start.*YYYY-MM-DD/],
      [(w) => (w[0].end = '2026-02-30'), /end.*not a day/],
      [(w) => (w[0].end = '2026-10-19'), /ends before it starts/],
      [(w) => delete w[0].estimate, /estimate.*true or false/],
      [(w) => (w[1].start = '2026-11-02'), /starts before .*Wave 1 · Focus.* ends/],
    ];
    for (const [change, why] of cases) assert.throws(() => planOf(withWaves(change)), why);
  });
});

describe('a wave planned again', () => {
  const earlier = { start: '2026-10-20', end: '2026-11-02', replaced: '2026-10-19', why: 'the measured rate' };
  const redated = (change = () => {}) =>
    withWaves((w) => {
      w[0].end = '2026-10-25';
      w[0].earlier_plan = { ...earlier };
      change(w);
    });

  test('keeps its earlier plan, and a wave never planned again has none', () => {
    const plan = planOf(redated());
    assert.deepEqual(plan.waves[0].earlierPlan, earlier);
    assert.equal(plan.waves[1].earlierPlan, null);
  });

  test('is refused when the earlier plan is not an object, has a bad day, ends before it starts or has no why', () => {
    for (const [change, re] of [
      [(w) => (w[0].earlier_plan = 'old'), /earlier_plan must hold start, end, replaced and why/],
      [(w) => (w[0].earlier_plan.end = '2026-13-01'), /earlier_plan.*end.*not a day/],
      [(w) => (w[0].earlier_plan.replaced = 'yesterday'), /earlier_plan.*replaced must be YYYY-MM-DD/],
      [(w) => (w[0].earlier_plan.end = '2026-10-01'), /earlier_plan ends before it starts/],
      [(w) => (w[0].earlier_plan.why = ' '), /earlier_plan needs a why/],
    ])
      assert.throws(() => planOf(redated(change)), re);
  });

  test('a workstream’s size is S, M or L, or left out; anything else is refused', () => {
    const file = (size) => JSON.stringify({ A: { title: 'A', size, requirements: [] } });
    assert.equal(readWorkstreams(file('L')).A.size, 'L');
    assert.equal(readWorkstreams(JSON.stringify({ A: { title: 'A', requirements: [] } })).A.size, undefined);
    assert.throws(() => readWorkstreams(file('XL')), /workstream A: size must be S, M or L/);
  });
});

describe('the Wave and Order of each requirement', () => {
  test('give each requirement the wave of its workstream, and Order as wave, then workstream, then requirement position', () => {
    const issues = byId(desiredWith());
    assert.deepEqual(
      ['focus_neighbours', 'focus_link', 'done_means_proved', 'stray_new'].map((id) => [
        id,
        issues[id].wave,
        issues[id].order,
      ]),
      [
        // a wave whose dates are estimates says so in its title, which is also the iteration's
        ['focus_neighbours', 'Wave 1 · Focus · est.', 10101],
        ['focus_link', 'Wave 1 · Focus · est.', 10102],
        // listed by S3 first, then the one S3 holds because no workstream lists it, in the copy's order
        ['done_means_proved', 'Wave 2 · Slice end', 20101],
        ['stray_new', 'Wave 2 · Slice end', 20102],
      ],
    );
  });

  test('a requirement whose workstream is in no wave has no Wave and no Order, which the mirror clears', () => {
    const issues = byId(desiredWith());
    assert.deepEqual([issues.zoom_out_to_fit.wave, issues.zoom_out_to_fit.order], [null, null]);
  });

  test('a reordered plan moves Order: the waves swapped, and two workstreams swapped within a wave', () => {
    const swapped = withWaves((w) => {
      [w[0].workstreams, w[1].workstreams] = [w[1].workstreams, w[0].workstreams];
    });
    const issues = byId(desiredWith(swapped));
    assert.deepEqual(
      [issues.done_means_proved.order, issues.focus_neighbours.order, issues.focus_neighbours.wave],
      [10101, 20101, 'Wave 2 · Slice end'],
    );
    const joined = withWaves((w) => {
      w[0].workstreams = ['S3', 'W1'];
      w.pop();
    });
    const again = byId(desiredWith(joined));
    assert.deepEqual([again.stray_new.order, again.focus_link.order], [10102, 10202]);
  });

  test('an open question has no Wave and no Order', () => {
    const desired = desiredState(
      { ...board, questions: [{ id: 'q_x', num: 'Q-1', slice: 3, text: 'Why?', blocks: [] }] },
      { ...WORKSTREAMS, Q: { title: 'Open questions', requirements: [] } },
      [3, 4],
      planOf(),
    );
    const q = desired.issues.find((i) => i.id === 'q_x');
    assert.deepEqual([q.wave, q.order], [null, null]);
  });

  test('without a plan the mirror leaves Wave and Order alone, and makes no iterations', () => {
    const desired = desiredState(board, WORKSTREAMS, [3, 4]);
    assert.ok(desired.issues.every((i) => i.wave === undefined && i.order === undefined));
    assert.equal(desired.iterations, null);
  });

  test('the iterations of the Wave field are the waves, each with its start and its length in days', () => {
    assert.deepEqual(iterationsOf(planOf()), [
      { title: 'Wave 1 · Focus · est.', startDate: '2026-10-20', duration: 14 },
      { title: 'Wave 2 · Slice end', startDate: '2026-11-03', duration: 14 },
    ]);
    assert.deepEqual(desiredWith().iterations, iterationsOf(planOf()));
  });

  test('an iteration whose dates are estimates is titled so, “· est.” after the wave’s title, and a firm one is not', () => {
    const [estimated, firm] = iterationsOf(planOf()).map((i) => i.title);
    assert.equal(estimated, 'Wave 1 · Focus · est.');
    assert.equal(firm, 'Wave 2 · Slice end');
  });
});

describe('the tally the mirror prints', () => {
  test('counts each wave’s requirements by proof, and marks estimated dates', () => {
    const lines = waveLines(desiredWith());
    assert.deepEqual(lines.slice(0, 2), [
      'wave Wave 1 · Focus (2026-10-20 to 2026-11-02, estimate): 2 requirements · 0 proved · 1 part · 1 open',
      'wave Wave 2 · Slice end (2026-11-03 to 2026-11-16): 2 requirements · 0 proved · 0 part · 2 open',
    ]);
  });

  test('flags each requirement that is not proved and is in no wave; a proved one in no wave is only counted', () => {
    const lines = waveLines(desiredWith(withWaves((w) => w.pop())));
    assert.ok(lines.includes('in no wave: 3 requirements, 2 of them not proved'));
    assert.ok(lines.includes('warning: requirement done_means_proved (open) is in no wave'));
    assert.ok(lines.includes('warning: requirement stray_new (open) is in no wave'));
    assert.ok(!lines.some((l) => l.includes('zoom_out_to_fit')));
  });

  test('is printed by --check, which flags a requirement in no wave and changes nothing', () => {
    const gh = fakeGithub();
    const out = [];
    const desired = desiredWith(withWaves((w) => w.pop()));
    const deps = { run: gh.run, originRepo: 'rogerbucks/thoughtknot', write: (t) => out.push(t), sleep: () => {} };
    mirror({ desired, mode: 'check' }, deps);
    const text = out.join('');
    assert.match(text, /^wave Wave 1 · Focus \(2026-10-20 to 2026-11-02, estimate\): 2 requirements/m);
    assert.match(text, /^warning: requirement stray_new \(open\) is in no wave$/m);
    assert.deepEqual(gh.hub.mutations, []);
  });

  test('says, in a line of its own, that the dates marked estimate are estimates; nothing of it when none is', () => {
    const note = (lines) => lines.filter((l) => l.startsWith('note: '));
    assert.deepEqual(note(waveLines(desiredWith())), [
      'note: the dates of waves marked estimate are estimates, not commitments; the coordinator sets the real ones',
    ]);
    assert.deepEqual(note(waveLines(desiredWith(withWaves((w) => (w[0].estimate = false))))), []);
  });

  test('takes a wave with no workstreams, as a placeholder: counted with none, and no error or warning', () => {
    const placeholder = withWaves((w) =>
      w.push({ title: 'Held', start: '2026-11-17', end: '2026-11-30', estimate: true, workstreams: [] }),
    );
    const lines = waveLines(desiredWith(placeholder));
    const held = 'wave Held (2026-11-17 to 2026-11-30, estimate): 0 requirements · 0 proved · 0 part · 0 open';
    assert.ok(lines.includes(held));
    assert.ok(!lines.some((l) => l.startsWith('warning:')));
  });

  test('says nothing of waves when there is no plan', () => {
    assert.deepEqual(waveLines(desiredState(board, WORKSTREAMS, [3, 4])), []);
  });
});

describe('the real waves file', () => {
  const realBoard = readBoard(read(REQUIREMENTS));
  const workstreams = readWorkstreams(read('requirements/workstreams.json'));
  const plan = readWaves(read(WAVES_FILE), workstreams);
  const desired = desiredState(realBoard, workstreams, [3, 4, 5, 6, 7, 8, 9, 10], plan);

  test('is read without a fault, every date marked an estimate until the coordinator sets them', () => {
    assert.equal(WAVES_FILE, 'requirements/waves.json');
    assert.ok(plan.waves.length > 0);
    assert.ok(plan.waves.every((w) => w.estimate === true));
  });

  test('ends with a placeholder for Roger’s held changes, after all waves, holding no workstream', () => {
    const last = plan.waves.at(-1);
    assert.equal(last.title, 'Roger’s held changes, after all waves');
    assert.deepEqual(last.workstreams, []);
    assert.ok(last.start > plan.waves.at(-2).end);
  });

  test('holds the Obsidian community release (R2) in a wave of its own after all others but Roger’s held ones', () => {
    const at = plan.waves.findIndex((w) => w.workstreams.includes('R2'));
    assert.deepEqual(plan.waves[at].workstreams, ['R2']);
    assert.ok(plan.waves[at].start > plan.waves[at - 1].end);
    // Roger, 17 Oct 2026: what he adds later goes after R2, in waves titled “· Held:”, and only there.
    const held = (w) => w.title.includes('· Held:');
    assert.ok(plan.waves.slice(at + 1, -1).every(held), 'every wave between R2 and the placeholder is held');
    assert.ok(!plan.waves.slice(0, at).some(held), 'no held wave comes before R2');
  });

  test('keeps the earlier plan of every wave planned again from 19 Oct 2026, and every workstream has a size', () => {
    const again = plan.waves.filter((w) => w.earlierPlan);
    assert.ok(again.length >= 20, 'waves 4 onwards were planned again at the measured rate');
    // A wave first planned again on 19 Oct 2026 keeps that first plan. One first moved later says when.
    for (const w of again) assert.ok(w.earlierPlan.replaced >= '2026-10-19', w.title);
    for (const [id, w] of Object.entries(workstreams)) assert.match(w.size ?? '', /^[SML]$/, `${id} has a size`);
  });

  test('puts every requirement of slices 3 to 10 that is not proved in a wave', () => {
    const flagged = waveLines(desired).filter((l) => l.startsWith('warning:'));
    assert.deepEqual(flagged, []);
  });
});
