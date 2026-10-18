// Writing an export safely (editor spec §16, failed_export). The bytes go to a temporary file first and are renamed
// into place, so the target is never half written. On any failure the temporary file is removed and the reason is said
// in a sentence. The host gives the file operations; here they are fakes that fail at each step.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeSafely } from '../src/export-write.ts';

/** A fake file system. `fail` names the step that throws, and `partial` leaves half the bytes behind when a write fails. */
function fake({ fail = {}, files = {}, partial = false } = {}) {
  const fs = new Map(Object.entries(files)),
    calls = [];
  const maybe = (step, path) => {
    if (fail[step] && (fail[step].path === undefined || fail[step].path === path)) throw fail[step].error;
  };
  return {
    fs,
    calls,
    ops: {
      async write(path, bytes) {
        calls.push(['write', path]);
        if (fail.write && partial) fs.set(path, String(bytes).slice(0, 2));
        maybe('write', path);
        fs.set(path, bytes);
      },
      async rename(from, to) {
        calls.push(['rename', from, to]);
        maybe('rename', from);
        fs.set(to, fs.get(from));
        fs.delete(from);
      },
      async remove(path) {
        calls.push(['remove', path]);
        maybe('remove', path);
        fs.delete(path);
      },
    },
  };
}
const error = (message, code) => Object.assign(new Error(message), code ? { code } : {});
const TARGET = 'Trips/Team-2026-10-11.svg';

describe('a write that works', () => {
  // proves: failed_export
  test('writes to a temporary file, renames it into place, and leaves nothing else', async () => {
    const { fs, calls, ops } = fake();
    const r = await writeSafely(TARGET, '<svg/>', ops);
    assert.deepEqual(r, { ok: true, path: TARGET });
    assert.deepEqual([...fs.keys()], [TARGET]);
    assert.equal(fs.get(TARGET), '<svg/>');
    assert.deepEqual(calls, [
      ['write', `${TARGET}.part`],
      ['rename', `${TARGET}.part`, TARGET],
    ]);
  });

  // proves: failed_export
  test('never writes to the target itself, and takes the temporary name it is given', async () => {
    const { calls, ops } = fake();
    await writeSafely(TARGET, new Uint8Array([1, 2, 3]), ops, 'Trips/.export.tmp');
    assert.deepEqual(
      calls.filter(([op]) => op === 'write'),
      [['write', 'Trips/.export.tmp']],
    );
  });

  // proves: failed_export
  test('replaces a file already there only by the rename, which is whole or does not happen', async () => {
    const { fs, ops } = fake({ files: { [TARGET]: 'OLD' } });
    await writeSafely(TARGET, 'NEW', ops);
    assert.equal(fs.get(TARGET), 'NEW');
  });
});

describe('a write that fails', () => {
  // proves: failed_export
  test('in the write: the half-written temporary file is removed, the reason is said, the target is not made', async () => {
    const { fs, calls, ops } = fake({ fail: { write: { error: error('no room', 'ENOSPC') } }, partial: true });
    const r = await writeSafely(TARGET, '<svg>big</svg>', ops);
    assert.equal(r.ok, false);
    assert.equal(r.why, 'The export could not be written: the disk is full. Nothing was saved.');
    assert.deepEqual([...fs.keys()], []);
    assert.deepEqual(calls.at(-1), ['remove', `${TARGET}.part`]);
    assert.ok(!calls.some(([op]) => op === 'rename'));
  });

  // proves: failed_export
  test('in the write, with a file already there: the old file is untouched', async () => {
    const { fs, ops } = fake({
      files: { [TARGET]: 'OLD' },
      fail: { write: { error: error('denied', 'EACCES') } },
      partial: true,
    });
    const r = await writeSafely(TARGET, 'NEW', ops);
    assert.match(r.why, /^The export could not be written: permission was refused/);
    assert.deepEqual([...fs.entries()], [[TARGET, 'OLD']]);
  });

  // proves: failed_export
  test('in the rename: the temporary file is removed and the old file is untouched', async () => {
    const { fs, calls, ops } = fake({
      files: { [TARGET]: 'OLD' },
      fail: { rename: { error: error('busy', 'EBUSY') } },
    });
    const r = await writeSafely(TARGET, 'NEW', ops);
    assert.equal(r.ok, false);
    assert.match(
      r.why,
      /^The export could not be written: the file is in use by another program\. Nothing was saved\.$/,
    );
    assert.deepEqual([...fs.entries()], [[TARGET, 'OLD']]);
    assert.deepEqual(calls.at(-1), ['remove', `${TARGET}.part`]);
  });

  // proves: failed_export
  test('says why in a sentence for each common cause, and with the host’s own words for any other', async () => {
    const said = {
      ENOSPC: 'the disk is full',
      EACCES: 'permission was refused',
      EPERM: 'permission was refused',
      EROFS: 'the folder cannot be written to',
      ENOENT: 'the folder is not there',
      ENAMETOOLONG: 'the file name is too long',
    };
    for (const [code, why] of Object.entries(said)) {
      const r = await writeSafely(TARGET, 'x', fake({ fail: { write: { error: error('raw', code) } } }).ops);
      assert.equal(r.why, `The export could not be written: ${why}. Nothing was saved.`, code);
    }
    const other = await writeSafely(TARGET, 'x', fake({ fail: { write: { error: error('Disk on fire.') } } }).ops);
    assert.equal(other.why, 'The export could not be written: Disk on fire. Nothing was saved.');
    const text = await writeSafely(TARGET, 'x', fake({ fail: { rename: { error: 'refused' } } }).ops);
    assert.equal(text.why, 'The export could not be written: refused. Nothing was saved.');
    const none = await writeSafely(TARGET, 'x', fake({ fail: { write: { error: undefined } } }).ops);
    assert.match(none.why, /^The export could not be written: .+\. Nothing was saved\.$/);
  });

  // proves: failed_export
  test('when the temporary file cannot be removed either, says which file is left for the user to delete', async () => {
    const { ops } = fake({
      fail: { write: { error: error('no room', 'ENOSPC') }, remove: { error: error('locked', 'EBUSY') } },
      partial: true,
    });
    const r = await writeSafely(TARGET, 'abc', ops);
    assert.equal(r.ok, false);
    assert.equal(r.left, `${TARGET}.part`);
    assert.match(r.why, /the disk is full\./);
    assert.ok(r.why.includes(`${TARGET}.part could not be removed`), r.why);
    assert.doesNotMatch(r.why, /Nothing was saved/);
  });

  // proves: failed_export
  test('a temporary file that was never made counts as removed', async () => {
    const { ops } = fake({
      fail: { write: { error: error('no folder', 'ENOENT') }, remove: { error: error('gone', 'ENOENT') } },
    });
    const r = await writeSafely(TARGET, 'abc', ops);
    assert.equal(r.left, undefined);
    assert.match(r.why, /Nothing was saved\.$/);
  });

  // proves: failed_export
  test('an operation that throws at once, before it returns a promise, is caught like any other', async () => {
    const ops = {
      write() {
        throw error('sync', 'EACCES');
      },
      rename: async () => {},
      remove: async () => {},
    };
    const r = await writeSafely(TARGET, 'x', ops);
    assert.equal(r.ok, false);
  });

  // proves: empty_export
  test('nothing to write is refused before any file is touched', async () => {
    for (const bytes of ['', new Uint8Array(0)]) {
      const { calls, ops } = fake();
      const r = await writeSafely(TARGET, bytes, ops);
      assert.equal(r.ok, false);
      assert.match(r.why, /nothing to write/);
      assert.deepEqual(calls, []);
    }
  });

  // proves: failed_export
  test('a temporary name that is the target itself is refused before any file is touched', async () => {
    const { calls, ops } = fake();
    const r = await writeSafely(TARGET, 'x', ops, TARGET);
    assert.equal(r.ok, false);
    assert.deepEqual(calls, []);
  });
});
