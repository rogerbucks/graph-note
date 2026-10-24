// Where the tab's page may reach in the folder (spec §41, vscode_plugin): the desktop app's rules, kept in the
// extension (src/place.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkFree, placeProblem, stepsTo, SYMBOLIC_LINK } from '../src/place.ts';

test('a path inside the folder is allowed, and the folder itself only where a folder is asked for', () => {
  assert.equal(placeProblem('Reader.md'), null);
  assert.equal(placeProblem('plans/2026/Reader.md'), null);
  assert.equal(placeProblem('', { folder: true }), null);
  assert.equal(placeProblem(''), 'a file needs a name');
});

test('a path climbing out, from a root, hidden, or holding a backslash, colon or control character is refused', () => {
  for (const path of [
    '../a.md',
    'a/../../b.md',
    './a.md',
    '/etc/passwd',
    '~/a.md',
    '.git/config',
    'a/.obsidian/b',
    'a\\b.md',
    'C:a.md',
    'a\nb.md',
    'a//b.md',
    7,
  ])
    assert.notEqual(placeProblem(path), null, String(path));
});

test('a link on the way to a path is found, and a step not made yet is no link', async () => {
  assert.deepEqual(stepsTo('a/b/c.md'), ['a', 'a/b', 'a/b/c.md']);
  const types = { a: 2, 'a/b': 2 | SYMBOLIC_LINK, x: 2 };
  const typeOf = async (step) => types[step] ?? null;
  assert.equal(await linkFree('a/b/c.md', typeOf), false);
  assert.equal(await linkFree('x/new/c.md', typeOf), true);
});
