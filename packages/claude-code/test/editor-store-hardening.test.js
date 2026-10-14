// The note store hardened after the security review of #450 (spec §26, test_cc_store): a write never clears a draft
// saved after it began; a note keeps its file mode; a note with another hard link is refused; a folder swapped for a link
// under a write is caught before the rename; the drafts folder is its owner's alone; a draft of control characters is
// still offered; and the real fs.watch is seen to report a change. Each asserts the work done, never the time taken.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  linkSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { NoteStore } from '../server/editor-store.ts';
import { NODE_FILES } from '../server/note-file.ts';
import * as watching from '../server/note-watch.ts';
import { BODY_LIMIT } from '../server/request-body.ts';
import { ask, pause } from './editor-threats-support.js';
import {
  PLAN,
  PLAN_THEIRS,
  bearer,
  handWatch,
  holding,
  served,
  settle,
  tempVault,
  writing,
} from './editor-store-support.js';

const at = (id) => `/api/notes/${id}`;
const json = (r) => JSON.parse(r.text);
const sha = (bytes) => `"${createHash('sha256').update(bytes).digest('hex')}"`;
const posix = process.platform !== 'win32';

/** A vault, its store served, and the plan opened. */
async function opened(options = {}, v = tempVault()) {
  const { store, server } = await served(v, options);
  const o = await store.open('Notes/plan.md');
  assert.equal(o.ok, true, o.why);
  return { v, store, s: server, id: o.id, version: sha(readFileSync(v.plan)) };
}

const put = (s, id, text, version) =>
  ask(s.port, { method: 'PUT', path: at(id), headers: writing(s, version), body: text });
const keepDraft = (s, id, text) =>
  ask(s.port, { method: 'PUT', path: `${at(id)}/draft`, headers: writing(s), body: text });
const offered = async (s, id) => json(await ask(s.port, { path: at(id), headers: bearer(s) })).draft;

describe('drafts never lost to a write (cc_drafts_outside, cc_write_if_unchanged)', () => {
  test('a draft saved while an older write is under way is kept when that write finishes', async () => {
    const hold = holding('rename');
    const { s, id, version } = await opened({ files: hold.files });
    const pending = put(s, id, PLAN_THEIRS, version);
    await hold.at;
    const draft = keepDraft(s, id, 'Typed after the save began.\n');
    await settle();
    hold.release();
    assert.equal((await pending).status, 200);
    assert.equal((await draft).status, 204);
    assert.deepEqual(await offered(s, id), { text: 'Typed after the save began.\n', against: sha(PLAN_THEIRS) });
  });

  test('a draft of control characters, as long as a note may be, is still offered', async () => {
    const { s, id } = await opened();
    const text = '\u0001'.repeat(BODY_LIMIT);
    assert.equal((await keepDraft(s, id, text)).status, 204);
    assert.equal((await offered(s, id))?.text.length, BODY_LIMIT);
  });

  test('the drafts folder is its owner’s alone, even when it was made open before', { skip: !posix }, async () => {
    const v = tempVault();
    mkdirSync(v.data);
    chmodSync(v.data, 0o755);
    const store = await NoteStore.create({ vault: v.vault, drafts: v.data, watch: handWatch().watch });
    assert.equal(statSync(v.data).mode & 0o777, 0o700);
    await store.stop();
  });
});

describe('the note’s own file kept (cc_atomic_write)', () => {
  test('a note shared with its group keeps that mode once written', { skip: !posix }, async () => {
    const v = tempVault();
    chmodSync(v.plan, 0o664);
    const { s, id, version } = await opened({}, v);
    assert.equal((await put(s, id, PLAN_THEIRS, version)).status, 200);
    assert.equal(statSync(v.plan).mode & 0o777, 0o664);
  });

  test('a note with another hard link is refused when opened, and once one is made, read or written', async () => {
    const v = tempVault();
    linkSync(join(v.outside, 'secret.md'), join(v.vault, 'Notes/hard.md'));
    const { s, store, id, version } = await opened({}, v);
    const r = await store.open('Notes/hard.md');
    assert.equal(r.ok, false);
    assert.match(r.why, /hard link/);
    linkSync(v.plan, join(v.outside, 'plan-link.md'));
    assert.equal((await ask(s.port, { path: at(id), headers: bearer(s) })).status, 410);
    assert.equal((await put(s, id, PLAN_THEIRS, version)).status, 410);
    assert.equal(readFileSync(v.plan, 'utf8'), PLAN);
  });

  test('a folder swapped for a link out of the vault under a write is caught before the rename', async () => {
    const v = tempVault();
    const notes = join(v.vault, 'Notes'),
      copy = join(v.outside, 'Notes copy');
    const files = {
      ...NODE_FILES,
      async writeTemp(temp, text, mode) {
        await NODE_FILES.writeTemp(temp, text, mode);
        cpSync(notes, copy, { recursive: true });
        renameSync(notes, join(v.top, 'Notes moved'));
        symlinkSync(copy, notes);
      },
    };
    const { s, id, version } = await opened({ files }, v);
    const r = await put(s, id, PLAN_THEIRS, version);
    assert.equal(r.status, 500);
    assert.equal(readFileSync(join(copy, 'plan.md'), 'utf8'), PLAN);
    assert.equal(readFileSync(join(v.top, 'Notes moved', 'plan.md'), 'utf8'), PLAN);
  });
});

describe('the real watcher (cc_redrawn_on_change)', () => {
  test('fs.watch reports a change to the note, and stops when closed', async () => {
    // macOS starts a folder's watch a moment after it is asked for, and misses what comes first: the note is written
    // again until the watcher has seen a change, within a polling deadline, and the event is what is asserted
    const v = tempVault();
    let changes = 0;
    const close = watching.watchWith(0)(dirname(realpathSync(v.plan)), 'plan.md', () => changes++);
    for (let i = 0; changes === 0 && i < 200; i++) {
      writeFileSync(v.plan, `${PLAN_THEIRS}${i}\n`);
      await pause(50);
    }
    close();
    assert.ok(changes > 0, 'fs.watch saw no change to the note');
  });
});
