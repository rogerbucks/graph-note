// Personal profiles apply when the graph is shown (editor spec §39, profiles_at_display). They compose, and what is
// learned over time arrives as a suggestion the owner approves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { PersonalLayer, SHARED_SETTINGS, composeProfiles } from '../src/profiles.ts';
import { ProfileLearning } from '../src/learning.ts';
import { PERSONAL, WORK, worldOf } from './profiles-fixtures.js';

test('a learned preference arrives as a suggestion and applies only once approved', () => {
  const world = worldOf(PERSONAL);
  const profile = new PersonalLayer('roger', world.personal).settingsFor('roger');
  const learning = new ProfileLearning();
  learning.suggest({ id: 'roomy', setting: 'density', value: 'roomy', why: 'zoomed in often' });
  assert.equal(learning.applyTo(profile).density, 'compact', 'a suggestion changes nothing');
  assert.deepEqual(
    learning.waiting.map((s) => s.id),
    ['roomy'],
  );
  learning.approve('roomy');
  assert.equal(learning.applyTo(profile).density, 'roomy', 'once approved, it applies');
  assert.deepEqual(learning.waiting, []);
});

test('profiles compose, each later one setting what it names, over what everyone sees', () => {
  const world = worldOf(PERSONAL);
  assert.deepEqual(new PersonalLayer('roger', world.personal).settingsFor('roger'), {
    density: 'compact',
    chunk: 5,
    cues: 'icons',
    reminders: 'firm',
    pacing: 'calm',
  });
  assert.deepEqual(composeProfiles(), SHARED_SETTINGS);
  assert.equal(composeProfiles({ chunk: 4 }, { chunk: 9 }).chunk, 9);
});

test('a profile applies when shown: the graph itself is never changed', () => {
  const world = worldOf(PERSONAL, WORK);
  const before = gs.canon(world.work);
  new PersonalLayer('roger', world.personal).settingsFor('roger');
  assert.equal(gs.canon(world.work), before);
});
