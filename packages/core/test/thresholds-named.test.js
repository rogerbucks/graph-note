// The numbers a rule leaves open (editor spec §41, thresholds_named). Each is named once, with a default inside a
// stated range, a unit, what it governs and the requirement that leaves it open. A value handed in is taken only inside
// the range. Each behaves as stated at both edges of its range where the code reads it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { THRESHOLDS, thresholdValue } from '../src/thresholds.ts';
import { BUSY_HUB, busyHubs } from '../src/untangle-fold.ts';
import { DEFAULT_PACE, PathAutoplay } from '../src/path-play.ts';
import { REREAD_BUDGET } from '../src/partial-read.ts';
import { DIFF_LIMIT, lineDiff } from '../src/line-diff.ts';
import { PathPlayer, pathsOf } from '../src/paths.ts';
import { readNote } from '../src/drawing.ts';

const REQUIREMENTS = readFileSync(new URL('../../../requirements/editor-requirements.gql', import.meta.url), 'utf8');

/** A thing linked to `n` others. */
const star = (n) => ({
  keys: ['hub', ...Array.from({ length: n }, (_, i) => `t${i}`)],
  edges: Array.from({ length: n }, (_, i) => ({ from: 'hub', to: `t${i}` })),
});

describe('the open numbers', () => {
  // proves: thresholds_named
  test('each is named, with a default inside its range, a unit, what it governs and the rule that leaves it open', () => {
    for (const [name, t] of Object.entries(THRESHOLDS)) {
      assert.match(name, /^[a-z]+(_[a-z]+)*$/, name);
      assert.ok(t.least <= t.value && t.value <= t.most, name);
      assert.ok(t.unit && t.said.endsWith('.'), name);
      assert.ok(REQUIREMENTS.includes(`(${t.requirement}:Requirement`), `${name}: ${t.requirement}`);
    }
    // the code's own names read the defaults from here
    assert.deepEqual(
      [BUSY_HUB, DEFAULT_PACE, REREAD_BUDGET, DIFF_LIMIT],
      [
        THRESHOLDS.busy_hub.value,
        THRESHOLDS.path_pace.value,
        THRESHOLDS.reread_budget.value,
        THRESHOLDS.diff_limit.value,
      ],
    );
  });

  // proves: thresholds_named
  test('a value is taken at either edge of its range, and anything outside it gives the default', () => {
    for (const name of Object.keys(THRESHOLDS)) {
      const { least, most, value } = THRESHOLDS[name];
      assert.equal(thresholdValue(name, least), least, name);
      assert.equal(thresholdValue(name, most), most, name);
      for (const outside of [least - 1, most + 1, Number.NaN, Infinity, '12', null, undefined])
        assert.equal(thresholdValue(name, outside), value, `${name}: ${String(outside)}`);
    }
  });

  // proves: thresholds_named
  test('a busy hub at the edges: one link over the number folds, the number itself does not', () => {
    for (const most of [THRESHOLDS.busy_hub.least, THRESHOLDS.busy_hub.most]) {
      const over = star(most + 1),
        at = star(most);
      assert.deepEqual(busyHubs(over.keys, over.edges, most), ['hub'], `${most}`);
      assert.deepEqual(busyHubs(at.keys, at.edges, most), [], `${most}`);
    }
  });

  // proves: thresholds_named
  test('a line comparison at the edges: exactly the limit is compared, one more is too large', () => {
    const lines = (n) => Array.from({ length: n }, (_, i) => `line ${i}`).join('\n');
    assert.equal(lineDiff('', lines(1), 1)?.length, 1);
    assert.equal(lineDiff('', lines(2), 1), null);
    assert.equal(lineDiff('', lines(5), 4), null);
    assert.equal(lineDiff('', lines(4), 4)?.length, 4);
  });

  // proves: thresholds_named
  test('Play’s pace at the edges: the least and most are kept, a pace outside them is not', () => {
    const timer = { waits: [], after: (ms) => (timer.waits.push(ms), {}), cancel() {} };
    const walked =
      '// graph: trip\n(home:Place),\n(park:Place),\n(tour:Path),\n(tour)-[:STEP {seq: 1}]->(home),\n(tour)-[:STEP {seq: 2}]->(park)';
    const player = () => new PathPlayer(pathsOf(readNote([walked]), 'trip')[0]);
    for (const pace of [THRESHOLDS.path_pace.least, THRESHOLDS.path_pace.most, 100, 60_000]) {
      timer.waits = [];
      new PathAutoplay(player(), timer, pace).play();
      const inside = pace >= THRESHOLDS.path_pace.least && pace <= THRESHOLDS.path_pace.most;
      assert.equal(timer.waits[0], inside ? pace : DEFAULT_PACE, `${pace}`);
    }
  });
});
