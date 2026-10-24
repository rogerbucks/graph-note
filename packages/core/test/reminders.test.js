// Reminders are worked out by the engine and sent elsewhere (editor spec §39, reminders_sent_elsewhere). The profile
// styles them; the engine only offers them as data, and an outside tool sends them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { remindersFor } from '../src/reminders.ts';
import { composeProfiles } from '../src/profiles.ts';
import { WORK, worldOf } from './profiles-fixtures.js';

const TODAY = '2026-10-24';

test('a due reminder is exposed by the engine and sent only by an outside tool', async (t) => {
  const reached = [];
  t.mock.method(globalThis, 'fetch', async (...args) => reached.push(args));
  const { work } = worldOf(WORK);
  const offered = remindersFor(work, TODAY, composeProfiles({ reminders: 'firm' }));
  assert.deepEqual(offered, [
    { thing: 'report', says: 'Send the report', due: '2026-10-20', style: 'firm' },
    { thing: 'review', says: 'Review the plan', due: '2026-10-23', style: 'firm' },
  ]);
  assert.deepEqual(reached, [], 'the engine sent nothing');
  // the outside tool takes the data and sends it its own way
  const sent = [];
  const outsideTool = (list) => list.forEach((r) => sent.push(`${r.style}: ${r.says}`));
  outsideTool(JSON.parse(JSON.stringify(offered)));
  assert.deepEqual(sent, ['firm: Send the report', 'firm: Review the plan']);
  const source = readFileSync(new URL('../src/reminders.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|import\(['"]node:)/, 'and cannot');
});

test('the profile styles reminders: a chunk at a time, or none when off', () => {
  const { work } = worldOf(WORK);
  assert.deepEqual(
    remindersFor(work, TODAY, composeProfiles({ chunk: 3, reminders: 'gentle' })).map((r) => r.style),
    ['gentle', 'gentle'],
  );
  assert.equal(remindersFor(work, TODAY, composeProfiles({ chunk: 3 })).length, 2);
  assert.deepEqual(remindersFor(work, TODAY, composeProfiles({ reminders: 'off' })), []);
});
