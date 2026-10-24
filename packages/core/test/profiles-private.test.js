// Profiles are private (editor spec §39, profiles_private): nodes in the owner's personal layer, read only by the
// owner through the engine. A corporate view never sees them, only their effect on what is shown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PersonalLayer, SHARED_SETTINGS, corporateView } from '../src/profiles.ts';
import { PERSONAL, WORK, worldOf } from './profiles-fixtures.js';

test('profile nodes cannot be queried from a corporate view', () => {
  const world = worldOf(PERSONAL, WORK);
  const corporate = corporateView(world);
  for (const g of Object.values(corporate)) assert.deepEqual(g.labelled('Profile'), []);
  assert.deepEqual([...corporate.work.nodes.keys()], [...world.work.nodes.keys()], 'the work is all there');
});

test('only the owner reads a profile; anyone else sees the graph as shared', () => {
  const layer = new PersonalLayer('roger', worldOf(PERSONAL).personal);
  assert.equal(layer.profiles('roger').length, 2);
  assert.throws(() => layer.profiles('eve'), /only by its owner/);
  assert.deepEqual(layer.settingsFor('eve'), SHARED_SETTINGS);
});
