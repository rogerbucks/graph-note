// The editor's note store (spec §26, slice 4; test_cc_store). It runs against a real vault in a temporary folder,
// served by a running server.
// - Notes by id only, never a path from the page.
// - Every escape refused (`..`, symlinks out, hidden folders, other files).
// - Writes atomic and version-checked. A draft is kept on conflict, outside the vault, and offered on reopen.
// - A change on disk streamed to the page and drawn again. Undo never over another program's change.
// - A stop that waits for a write under way and lets none start.
// A watcher fired by hand and file operations held at one step stand in for timing. A test asserts the work done,
// never the time taken.
import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, realpathSync, renameSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { EditorSession } from '../src/editor-session.ts';
import { NoteStore } from '../server/editor-store.ts';
import { NODE_FILES } from '../server/note-file.ts';
import { WATCH_DEBOUNCE_MS, debounced } from '../server/note-watch.ts';
import { ask } from './editor-threats-support.js';
import {
  PLAN,
  PLAN_THEIRS,
  SECRET,
  bearer,
  follow,
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
const folderOf = (f) => readdirSync(dirname(f)).sort();

/** A vault, its store served, and the plan opened: the id the server gave it and its version on disk. */
async function opened(options = {}) {
  const v = tempVault();
  const { store, server } = await served(v, options);
  const o = await store.open('Notes/plan.md');
  assert.equal(o.ok, true, o.why);
  return { v, store, s: server, id: o.id, version: sha(readFileSync(v.plan)) };
}

const put = (s, id, text, version) =>
  ask(s.port, { method: 'PUT', path: at(id), headers: writing(s, version), body: text });

describe('notes by id only (cc_open_notes_only)', () => {
  test('an opened note is read by the id the server gave it, with its text and version', async () => {
    const { s, id, version } = await opened();
    assert.match(id, /^[0-9a-f]{32}$/);
    const r = await ask(s.port, { path: at(id), headers: bearer(s) });
    assert.equal(r.status, 200);
    assert.deepEqual(json(r), { text: PLAN, version, draft: null });
    assert.equal(r.headers.etag, version);
  });

  test('an id never opened, a path, or anything else in the address reaches no note, read or write', async () => {
    const { v, s, id, version } = await opened();
    const tries = [
      at('0'.repeat(32)),
      at(id.toUpperCase()),
      at(`${id}0`),
      at('Notes%2Fplan.md'),
      '/api/notes/Notes/plan.md',
      `/api/notes/../notes/${id}`,
      '/api/notes/..%2f..%2foutside%2fsecret.md',
      `/api/notes/${id}%00`,
      `/api/notes/${id}/../${id}`,
      `/api/notes//${id}`,
      '/api/open/Notes/plan.md',
      '/api/notes',
    ];
    for (const path of tries) {
      const read = await ask(s.port, { path, headers: bearer(s) });
      assert.equal(read.status, 404, path);
      assert.equal(read.text, 'No such note is open.', path);
      const write = await ask(s.port, { method: 'PUT', path, headers: writing(s, version), body: 'escaped' });
      assert.equal(write.status, 404, path);
    }
    assert.equal(readFileSync(v.plan, 'utf8'), PLAN);
    assert.equal(readFileSync(join(v.outside, 'secret.md'), 'utf8'), SECRET);
  });

  test('the same note opened twice, or through a link to it inside the vault, keeps the one id', async () => {
    const { store, id } = await opened();
    assert.deepEqual(await store.open('Notes/plan.md'), { ok: true, id });
    assert.deepEqual(await store.open('inside-link.md'), { ok: true, id });
    const other = await store.open('Notes/other.md');
    assert.equal(other.ok, true);
    assert.notEqual(other.id, id);
  });
});

describe('no escape (cc_no_escape)', () => {
  const refusals = [
    ['../outside/secret.md', /outside the vault/],
    ['Notes/../../outside/secret.md', /outside the vault/],
    ['/etc/hosts', /outside the vault/],
    ['link-out.md', /leads outside the vault/],
    ['Linked/secret.md', /leads outside the vault/],
    ['.obsidian/workspace.md', /hidden/],
    ['.git/notes.md', /hidden/],
    ['.trash/old.md', /hidden/],
    ['Notes/.hidden.md', /hidden/],
    ['to-hidden.md', /hidden/],
    ['readme.txt', /not a Markdown note/],
    ['text-link.md', /not a Markdown note/],
    ['Notes', /not a Markdown note/],
    ['Notes/plan.md\0.txt', /not a note’s path/],
    ['', /not a note’s path/],
    ['Notes/none.md', /not there/],
  ];

  test('a note whose real path leaves the vault, is not .md, or lies in a hidden folder is refused', async () => {
    const v = tempVault();
    const { store } = await served(v);
    for (const [path, why] of refusals) {
      const r = await store.open(path);
      assert.equal(r.ok, false, path);
      assert.match(r.why, why, path);
      assert.equal(r.id, undefined, path);
    }
    assert.equal((await store.open(join(v.vault, 'Notes/plan.md'))).ok, true, 'a full path inside the vault');
  });

  test('a note swapped for a link out of the vault after it was opened is neither read nor written', async () => {
    const { v, s, id } = await opened();
    renameSync(v.plan, join(v.top, 'moved.md'));
    symlinkSync(join(v.outside, 'secret.md'), v.plan);
    const read = await ask(s.port, { path: at(id), headers: bearer(s) });
    assert.equal(read.status, 410);
    assert.doesNotMatch(read.text, /Outside the vault/);
    const write = await put(s, id, 'escaped', sha(SECRET));
    assert.equal(write.status, 410);
    assert.equal(readFileSync(join(v.outside, 'secret.md'), 'utf8'), SECRET);
  });

  test('the store’s vault is its real path, and a drafts folder inside the vault is refused', async () => {
    const v = tempVault();
    const store = await NoteStore.create({ vault: v.vault, drafts: v.data, watch: handWatch().watch });
    assert.equal(store.vault, realpathSync(v.vault));
    await store.stop();
    for (const drafts of [join(v.vault, 'drafts'), v.vault, join(v.vault, '.obsidian')])
      await assert.rejects(NoteStore.create({ vault: v.vault, drafts }), /outside the vault/);
  });
});

describe('atomic writes (cc_atomic_write)', () => {
  test('a write goes to a new file beside the note, renamed into place: until then the note is the old one whole', async () => {
    const hold = holding('rename');
    const { v, s, id, version } = await opened({ files: hold.files });
    const before = folderOf(v.plan);
    const pending = put(s, id, PLAN_THEIRS, version);
    const [temp, target] = await hold.at;
    assert.equal(target, realpathSync(v.plan));
    assert.equal(dirname(temp), dirname(target));
    assert.notEqual(temp, target);
    assert.equal(readFileSync(temp, 'utf8'), PLAN_THEIRS);
    assert.equal(readFileSync(v.plan, 'utf8'), PLAN);
    hold.release();
    const r = await pending;
    assert.equal(r.status, 200);
    assert.equal(readFileSync(v.plan, 'utf8'), PLAN_THEIRS);
    assert.deepEqual(json(r), { version: sha(PLAN_THEIRS) });
    assert.deepEqual(folderOf(v.plan), before);
  });

  test('an interrupted write leaves the old note whole, no temporary file, and what was typed as a draft', async () => {
    const faults = {
      'cut short': {
        ...NODE_FILES,
        async writeTemp(temp, text, mode) {
          await NODE_FILES.writeTemp(temp, text.slice(0, 20), mode);
          throw Object.assign(new Error('no space'), { code: 'ENOSPC' });
        },
      },
      'rename refused': {
        ...NODE_FILES,
        rename: async () => {
          throw Object.assign(new Error('busy'), { code: 'EBUSY' });
        },
      },
    };
    for (const [name, files] of Object.entries(faults)) {
      const { v, s, id, version } = await opened({ files });
      const before = folderOf(v.plan);
      const r = await put(s, id, PLAN_THEIRS, version);
      assert.equal(r.status, 500, name);
      assert.match(json(r).why, /disk is full|in use/, name);
      assert.equal(readFileSync(v.plan, 'utf8'), PLAN, name);
      assert.deepEqual(folderOf(v.plan), before, name);
      const back = json(await ask(s.port, { path: at(id), headers: bearer(s) }));
      assert.deepEqual(back.draft, { text: PLAN_THEIRS, against: version }, name);
    }
  });
});

describe('a write only against the version it names (cc_write_if_unchanged)', () => {
  test('the version is the SHA-256 of the note’s bytes; a write naming none is refused and nothing is written', async () => {
    const { v, s, id, version } = await opened();
    assert.equal(version, sha(PLAN));
    const r = await put(s, id, 'changed', undefined);
    assert.equal(r.status, 428);
    assert.equal(readFileSync(v.plan, 'utf8'), PLAN);
  });

  test('a stale write is refused with the note as it now is, the note unchanged, what was typed kept as a draft', async () => {
    const { v, s, id, version } = await opened();
    writeFileSync(v.plan, PLAN_THEIRS);
    const r = await put(s, id, `${PLAN}Typed.\n`, version);
    assert.equal(r.status, 409);
    assert.deepEqual(json(r), { text: PLAN_THEIRS, version: sha(PLAN_THEIRS), draft: true });
    assert.equal(r.headers.etag, sha(PLAN_THEIRS));
    assert.equal(readFileSync(v.plan, 'utf8'), PLAN_THEIRS);
    const back = json(await ask(s.port, { path: at(id), headers: bearer(s) }));
    assert.deepEqual(back.draft, { text: `${PLAN}Typed.\n`, against: version });
  });

  test('two writes against one version, sent at once, are compared in turn: one is made, the other refused', async () => {
    const { v, s, id, version } = await opened();
    const answers = await Promise.all([put(s, id, 'first\n', version), put(s, id, 'second\n', version)]);
    assert.deepEqual(answers.map((a) => a.status).sort(), [200, 409]);
    const made = answers.find((a) => a.status === 200);
    assert.equal(sha(readFileSync(v.plan)), made.headers.etag);
  });
});

describe('drawn again on a change on disk (cc_redrawn_on_change)', () => {
  test('a change another program writes reaches the page on the change stream, and is drawn again', async () => {
    const w = handWatch();
    const { v, s, id, version } = await opened({ watch: w.watch });
    assert.deepEqual(
      w.watched.map((e) => [e.folder, e.file]),
      [[dirname(realpathSync(v.plan)), 'plan.md']],
    );
    const stream = follow(s, id);
    assert.equal(await stream.status, 200);
    assert.deepEqual(await stream.next(), { version, text: PLAN });
    const page = new EditorSession(PLAN, version);
    writeFileSync(v.plan, PLAN_THEIRS);
    w.fire('plan.md');
    const event = await stream.next();
    assert.deepEqual(event, { version: sha(PLAN_THEIRS), text: PLAN_THEIRS });
    assert.equal(page.changed(event.text, event.version), 'reloaded');
    assert.match(page.text, /'Done'/);
  });

  test('with something typed, the change is said to be a conflict and what is typed is kept', async () => {
    const page = new EditorSession(PLAN, sha(PLAN));
    const typed = page.text.replace("'Start'", "'Begin'");
    page.type({ text: typed, start: 0, end: 0 });
    assert.equal(page.changed(PLAN_THEIRS, sha(PLAN_THEIRS)), 'conflict');
    assert.equal(page.text, typed);
  });

  test('the editor’s own write, and a watcher event with nothing changed, send nothing', async () => {
    const w = handWatch();
    const { v, s, id, version } = await opened({ watch: w.watch });
    const stream = follow(s, id);
    await stream.next();
    assert.equal((await put(s, id, `${PLAN}Ours.\n`, version)).status, 200);
    w.fire('plan.md');
    w.fire('plan.md');
    writeFileSync(v.plan, PLAN_THEIRS);
    w.fire('plan.md');
    assert.deepEqual(await stream.next(), { version: sha(PLAN_THEIRS), text: PLAN_THEIRS });
  });

  test('a note removed, or swapped for a link out of the vault, is said to be gone, and nothing outside is sent', async () => {
    const w = handWatch();
    const { v, s, id } = await opened({ watch: w.watch });
    const stream = follow(s, id);
    await stream.next();
    renameSync(v.plan, join(v.top, 'moved.md'));
    symlinkSync(join(v.outside, 'secret.md'), v.plan);
    w.fire('plan.md');
    const event = await stream.next();
    assert.equal(typeof event.gone, 'string');
    assert.equal(event.text, undefined);
  });

  test('the stream needs the token', async () => {
    const { s, id } = await opened();
    const stream = follow(s, id, {});
    assert.equal(await stream.status, 401);
  });

  test('fs.watch’s burst of events for one change is read once, well within a second', () => {
    assert.ok(WATCH_DEBOUNCE_MS > 0 && WATCH_DEBOUNCE_MS <= 250, `${WATCH_DEBOUNCE_MS}`);
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      let reads = 0;
      const changed = debounced(() => reads++, WATCH_DEBOUNCE_MS);
      for (let i = 0; i < 5; i++) changed();
      mock.timers.tick(WATCH_DEBOUNCE_MS - 1);
      assert.equal(reads, 0);
      mock.timers.tick(1);
      assert.equal(reads, 1);
      changed();
      mock.timers.tick(WATCH_DEBOUNCE_MS);
      assert.equal(reads, 2);
    } finally {
      mock.timers.reset();
    }
  });
});

describe('drafts outside the vault (cc_drafts_outside)', () => {
  test('a draft is kept in the data folder by note, never in the vault, and offered again when the note is reopened', async () => {
    const { v, s, store, id, version } = await opened();
    const vaultBefore = readdirSync(v.vault, { recursive: true }).sort();
    const keep = await ask(s.port, { method: 'PUT', path: `${at(id)}/draft`, headers: writing(s), body: 'Typed.\n' });
    assert.equal(keep.status, 204);
    assert.deepEqual(readdirSync(v.vault, { recursive: true }).sort(), vaultBefore);
    const kept = readdirSync(v.data);
    assert.equal(kept.length, 1);
    assert.match(kept[0], /^[0-9a-f]{64}\.json$/);
    if (process.platform !== 'win32') assert.equal(statSync(join(v.data, kept[0])).mode & 0o077, 0);
    await store.stop();
    const again = await NoteStore.create({ vault: v.vault, drafts: v.data, watch: handWatch().watch });
    const o = await again.open('Notes/plan.md');
    const r = await again.api({ method: 'GET', path: `notes/${o.id}`, body: '', headers: {} });
    assert.deepEqual(JSON.parse(r.text).draft, { text: 'Typed.\n', against: version });
    const other = await again.open('Notes/other.md');
    const none = await again.api({ method: 'GET', path: `notes/${other.id}`, body: '', headers: {} });
    assert.equal(JSON.parse(none.text).draft, null);
    await again.stop();
  });

  test('a write that is made clears the note’s draft; an empty draft clears it too', async () => {
    const { s, id, version } = await opened();
    const draft = (body) => ask(s.port, { method: 'PUT', path: `${at(id)}/draft`, headers: writing(s), body });
    const offered = async () => json(await ask(s.port, { path: at(id), headers: bearer(s) })).draft;
    await draft('Typed.\n');
    assert.equal((await put(s, id, `${PLAN}Saved.\n`, version)).status, 200);
    assert.equal(await offered(), null);
    await draft('Typed again.\n');
    await draft('');
    assert.equal(await offered(), null);
  });
});

describe('undo never over another program’s change (cc_undo_safe)', () => {
  /** The page's session, with one write of its own made through the server. */
  async function written(t) {
    const page = new EditorSession(PLAN, t.version);
    page.type({ text: page.text.replace("'Start'", "'Begin'"), start: 0, end: 0 });
    const w = page.write();
    const r = await put(t.s, t.id, w.note, w.against);
    assert.equal(r.status, 200);
    page.written(json(r).version);
    return page;
  }

  test('after another program changes the block, undo says so and undoes nothing', async () => {
    const t = await opened();
    const page = await written(t);
    const theirs = readFileSync(t.v.plan, 'utf8').replace("'Finish'", "'Done'");
    writeFileSync(t.v.plan, theirs);
    assert.equal(page.changed(theirs, sha(theirs)), 'reloaded');
    const u = page.undo();
    assert.equal(u.ok, false);
    assert.match(u.reason, /another program changed/i);
    assert.equal(page.text, theirs.slice(theirs.indexOf('// graph'), theirs.indexOf('\n```\nThe end')));
    assert.equal(readFileSync(t.v.plan, 'utf8'), theirs);
  });

  test('the typing undone never brings back text another program replaced', () => {
    const page = new EditorSession(PLAN, sha(PLAN));
    page.type({ text: page.text.replace("'Start'", "'Begin'"), start: 0, end: 0 });
    page.undoTyping();
    assert.equal(page.changed(PLAN_THEIRS, sha(PLAN_THEIRS)), 'reloaded');
    assert.equal(page.undoTyping(), null);
    assert.match(page.text, /'Done'/);
  });

  test('the control: its own write is undone, and another program’s change elsewhere in the note is kept', async () => {
    const t = await opened();
    const page = await written(t);
    const theirs = `${readFileSync(t.v.plan, 'utf8')}Their line.\n`;
    writeFileSync(t.v.plan, theirs);
    assert.equal(page.changed(theirs, sha(theirs)), 'unchanged');
    const u = page.undo();
    assert.equal(u.ok, true);
    assert.equal((await put(t.s, t.id, u.note, u.against)).status, 200);
    assert.equal(readFileSync(t.v.plan, 'utf8'), `${PLAN}Their line.\n`);
  });

  test('an undo sent before the page has seen another program’s change is refused by the server', async () => {
    const t = await opened();
    const page = await written(t);
    const theirs = readFileSync(t.v.plan, 'utf8').replace("'Finish'", "'Done'");
    writeFileSync(t.v.plan, theirs);
    const u = page.undo();
    assert.equal(u.ok, true);
    const r = await put(t.s, t.id, u.note, u.against);
    assert.equal(r.status, 409);
    assert.equal(readFileSync(t.v.plan, 'utf8'), theirs);
  });
});

describe('a stop and a write at once (C0 review)', () => {
  test('a write under way when the server is told to stop is finished whole before it counts as stopped', async () => {
    const hold = holding('rename');
    const { v, s, store, id, version } = await opened({ files: hold.files });
    const pending = put(s, id, PLAN_THEIRS, version).catch(() => null);
    await hold.at;
    let closed = false;
    void s.stop().then(() => (closed = true));
    await settle();
    assert.equal(closed, false);
    assert.equal(store.writing, 1);
    hold.release();
    await s.closed;
    await pending;
    assert.equal(readFileSync(v.plan, 'utf8'), PLAN_THEIRS);
    assert.equal(store.writing, 0);
    assert.deepEqual(
      folderOf(v.plan).filter((f) => f.startsWith('.plan')),
      [],
    );
  });

  test('once stopped, no write is made, a draft neither, and one waiting its turn is not made', async () => {
    const hold = holding('rename');
    const { v, s, store, id, version } = await opened({ files: hold.files });
    const first = put(s, id, 'first\n', version).catch(() => null);
    await hold.at;
    const second = store.api({
      method: 'PUT',
      path: `notes/${id}`,
      body: 'second\n',
      headers: { 'if-match': sha('first\n') },
    });
    const stopping = store.stop();
    hold.release();
    await stopping;
    await first;
    assert.equal((await second).status, 503);
    assert.equal(readFileSync(v.plan, 'utf8'), 'first\n');
    const late = await store.api({
      method: 'PUT',
      path: `notes/${id}`,
      body: 'late\n',
      headers: { 'if-match': sha('first\n') },
    });
    assert.equal(late.status, 503);
    const draft = await store.api({ method: 'PUT', path: `notes/${id}/draft`, body: 'late\n', headers: {} });
    assert.equal(draft.status, 503);
    assert.equal(readFileSync(v.plan, 'utf8'), 'first\n');
    assert.deepEqual(readdirSync(v.data), []);
  });
});
