// The entries of `.ignore` that must exist (scripts/ignore-entries.mjs). An entry git ignores is build output, so a fresh,
// unbuilt checkout lacks it. Any other entry naming a file must exist, so a misspelt path is caught. Tried on a small
// repository made in a temporary folder.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ignoreEntries, missingIgnoreEntries } from '../scripts/ignore-entries.mjs';

const folder = mkdtempSync(join(tmpdir(), 'ignore-entries-'));
after(() => rmSync(folder, { recursive: true, force: true }));
const put = (file, text) => writeFileSync(join(folder, file), text);
put('.gitignore', 'built.js\n');
put('.ignore', ['# comment', '', 'built/', 'built.js', 'kept.json', 'kept.jsn', 'lib/'].join('\n'));
put('kept.json', '{}\n');
execFileSync('git', ['init', '-q'], { cwd: folder });

test('the entries are the paths listed, comments and blank lines left out', () => {
  assert.deepEqual(ignoreEntries(folder), ['built/', 'built.js', 'kept.json', 'kept.jsn', 'lib/']);
});

test('in an unbuilt checkout an ignored build output may be missing, a misspelt path may not', () => {
  assert.deepEqual(missingIgnoreEntries(folder), ['kept.jsn']);
});

test('outside a git checkout it says so in one line, as it cannot tell which entries are build output', () => {
  const bare = mkdtempSync(join(tmpdir(), 'ignore-entries-bare-'));
  try {
    writeFileSync(join(bare, '.ignore'), 'something.js\n');
    assert.throws(
      () => missingIgnoreEntries(bare),
      (e) => /^.+ is not a git checkout, so which \.ignore entries are build output cannot be told$/.test(e.message),
    );
  } finally {
    rmSync(bare, { recursive: true, force: true });
  }
});

test('built, the answer is the same; and a file that is not build output is missing once it is gone', () => {
  put('built.js', 'x\n');
  assert.deepEqual(missingIgnoreEntries(folder), ['kept.jsn']);
  rmSync(join(folder, 'kept.json'));
  assert.deepEqual(missingIgnoreEntries(folder), ['kept.json', 'kept.jsn']);
});
