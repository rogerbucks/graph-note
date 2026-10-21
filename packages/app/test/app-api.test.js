// The editor's calls answered inside the app's window (spec §41, standalone_app). The browser editor's page runs in
// the app unchanged. These tests drive the page's own call modules (server-calls.ts, note-calls.ts) against the app's
// answers. The notes are kept in memory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from '../../core/src/note-storage.ts';
import { serverCalls } from '../../claude-code/page/server-calls.ts';
import { noteCalls } from '../../claude-code/page/note-calls.ts';
import { exportCalls } from '../../claude-code/page/export-calls.ts';
import { appFetch, FOLLOW_EVERY_MS } from '../src/app-api.ts';

const NOTE = 'Plans/trip.md';

/** The app's fetch over one note, with a clock the test moves by hand. */
function app(text = '# Trip\n') {
  const storage = memoryStorage({ [NOTE]: text });
  const waiting = [];
  const fetcher = appFetch({
    storage,
    setTimeout: (run, ms) => (waiting.push({ run, ms }), waiting.length),
    clearTimeout: () => {},
  });
  const tick = () => waiting.splice(0).forEach((w) => w.run());
  return { storage, fetcher, tick, waiting };
}

test('the page reads the settings and the note it was opened for, by its path', async () => {
  const { fetcher } = app();
  const calls = serverCalls('app', fetcher);
  assert.equal(typeof (await calls.settings()), 'object');
  const note = await calls.note(NOTE);
  assert.equal(note.text, '# Trip\n');
  assert.match(note.version, /^sha-256-64:/);
  assert.equal(note.draft, null);
});

test('a write made against the version read is kept, and one made against an older version is refused with the note as it is', async () => {
  const { fetcher, storage } = app();
  const calls = serverCalls('app', fetcher),
    notes = noteCalls('app', fetcher);
  const { version } = await calls.note(NOTE);
  const done = await notes.write(NOTE, '# Trip\n\nnew\n', version);
  assert.equal(done.ok, true);
  assert.equal((await storage.read(NOTE)).text, '# Trip\n\nnew\n');
  const stale = await notes.write(NOTE, 'lost?', version);
  assert.equal(stale.ok, false);
  assert.equal(stale.status, 409);
  assert.equal(stale.theirs.text, '# Trip\n\nnew\n');
  // what was refused is kept, and offered as the note's draft when it is opened again
  assert.deepEqual((await calls.note(NOTE)).draft, { text: 'lost?', against: version });
});

test('a write without the version it was typed against is refused', async () => {
  const { fetcher } = app();
  const reply = await fetcher(`/api/notes/${encodeURIComponent(NOTE)}`, { method: 'PUT', body: 'x' });
  assert.equal(reply.status, 428);
});

test('the change stream sends the note, then each change another program makes, and stops when the page stops it', async () => {
  const { fetcher, storage, tick, waiting } = app();
  const reply = await fetcher(`/api/notes/${encodeURIComponent(NOTE)}/events`);
  const reader = reply.body.getReader();
  const line = async () => JSON.parse(new TextDecoder().decode((await reader.read()).value));
  assert.equal((await line()).text, '# Trip\n');
  assert.equal(waiting[0].ms, FOLLOW_EVERY_MS);
  await storage.write(NOTE, 'changed elsewhere\n');
  tick();
  assert.equal((await line()).text, 'changed elsewhere\n');
  await storage.remove(NOTE);
  tick();
  assert.ok('gone' in (await line()));
  await reader.cancel();
});

test('earlier versions and reviews are refused in words, not left to fail', async () => {
  const { fetcher } = app();
  await assert.rejects(serverCalls('app', fetcher).versions(NOTE), /not in the app yet/);
});

test("an export goes beside the note, and its files are handed to be written as new ones, a PNG's as bytes", async () => {
  const saved = [];
  const fetcher = appFetch({
    storage: memoryStorage({ [NOTE]: '# Trip\n' }),
    saveNew: async (folder, files) => (saved.push({ folder, files }), files.map((f) => `new-${f.name}`)),
  });
  const exports = exportCalls('app', fetcher);
  assert.deepEqual(await exports.target(NOTE), { note: NOTE, folder: 'Plans' });
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 255]);
  const done = await exports.save(NOTE, [
    { name: 'trip.svg', text: '<svg/>' },
    { name: 'trip.png', bytes: png },
  ]);
  assert.deepEqual(done, { written: ['new-trip.svg', 'new-trip.png'] });
  assert.equal(saved[0].folder, 'Plans');
  assert.deepEqual(
    saved[0].files.map((f) => [f.name, [...f.bytes]]),
    [
      ['trip.svg', [...new TextEncoder().encode('<svg/>')]],
      ['trip.png', [...png]],
    ],
  );
  const refused = await exports.save(NOTE, []);
  assert.ok('stopped' in refused);
  // a note not in the folder, or an app that cannot write exports, has none
  await assert.rejects(exports.target('nowhere.md'));
  await assert.rejects(exportCalls('app', app().fetcher).target(NOTE));
});

test("only the editor's own calls are answered here; every other address goes to the window's fetch", async () => {
  const seen = [];
  const fetcher = appFetch(
    { storage: memoryStorage() },
    async (input) => (seen.push(String(input)), new Response('page')),
  );
  assert.equal(await (await fetcher('/page.css')).text(), 'page');
  assert.deepEqual(seen, ['/page.css']);
});
