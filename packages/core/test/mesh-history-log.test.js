// The mesh's log (editor spec §29, changes_logged_with_provenance): mesh-history.ts. Every change, every AI query and
// every bundle applied leaves an entry naming where it came from and when. A change the storage makes reaches the
// log through its history layer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MeshHistory } from '../src/mesh-history.ts';
import { historyLayer, memoryStorage } from '../src/note-storage.ts';

const NOTE = '```gql\n// graph: g\n(a:Thing)\n```';

test('each change, AI query and applied bundle leaves an entry naming its source and time', () => {
  const times = ['2026-10-23T10:00:00Z', '2026-10-23T10:05:00Z', '2026-10-23T10:10:00Z'];
  let i = 0;
  const h = new MeshHistory(() => times[i++]);
  h.change('a.md', NOTE, 'Roger');
  h.aiQuery('which parts are shaky?', ['a.md'], 'model:claude');
  h.bundle('bundle:types-1', { 'a.md': NOTE + '\n', 'b.md': NOTE }, 'Roger');
  assert.deepEqual(
    h.log().map((e) => [e.kind, e.source, e.at, e.notes, e.detail]),
    [
      ['change', 'Roger', times[0], ['a.md'], []],
      ['ai-query', 'model:claude', times[1], ['a.md'], ['which parts are shaky?']],
      ['bundle', 'Roger', times[2], ['a.md', 'b.md'], ['bundle:types-1']],
    ],
  );
});

test('a change the storage makes reaches the log with who made it', async () => {
  const h = new MeshHistory(() => 'never');
  const storage = historyLayer(h, () => '2026-10-23T11:00:00Z')(memoryStorage());
  await storage.write('a.md', NOTE, { author: 'Ann' });
  const [entry] = h.log();
  assert.equal(entry.kind, 'change');
  assert.equal(entry.at, '2026-10-23T11:00:00Z');
  assert.ok(entry.source.includes('Ann'), entry.source);
  assert.equal(h.textsAt('2026-10-23T11:00:00Z')['a.md'], NOTE);
});
