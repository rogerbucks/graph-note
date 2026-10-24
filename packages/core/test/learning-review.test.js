// The private review lens of what was learned (editor spec §39, learning_review_lens). Each item rolls back in one
// tap, and clear-all takes them all away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProfileLearning } from '../src/learning.ts';
import { SHARED_SETTINGS, composeProfiles } from '../src/profiles.ts';

function learned() {
  const l = new ProfileLearning();
  l.suggest({ id: 'calm', setting: 'pacing', value: 'calm', why: 'stepped-back' });
  l.suggest({ id: 'small', setting: 'chunk', value: 5, why: 'closed long lists' });
  l.approve('calm');
  l.approve('small');
  return l;
}

test('clear-all removes every learned item and rollback removes one', () => {
  const l = learned();
  assert.deepEqual(
    l.review().map((s) => [s.id, s.why]),
    [
      ['calm', 'stepped-back'],
      ['small', 'closed long lists'],
    ],
  );
  assert.equal(l.rollback('calm'), true);
  assert.deepEqual(
    l.review().map((s) => s.id),
    ['small'],
  );
  assert.equal(l.applyTo(SHARED_SETTINGS).pacing, 'steady', 'the rolled-back item no longer applies');
  l.clearAll();
  assert.deepEqual(l.review(), []);
  assert.deepEqual(l.applyTo(SHARED_SETTINGS), SHARED_SETTINGS);
});

test('a suggestion turned down never applies', () => {
  const l = new ProfileLearning();
  l.suggest({ id: 'brisk', setting: 'pacing', value: 'brisk', why: 'skipped-ahead' });
  l.decline('brisk');
  assert.deepEqual(l.waiting, []);
  assert.deepEqual(l.review(), []);
});

test('a kept item out of range sets nothing when applied', () => {
  const learning = new ProfileLearning({
    waiting: [],
    applied: [
      { id: 'a', setting: 'pacing', value: 'x', why: 'edited by hand' },
      { id: 'b', setting: 'chunk', value: 0, why: 'edited by hand' },
    ],
  });
  assert.deepEqual(learning.applyTo(composeProfiles()), composeProfiles());
});
