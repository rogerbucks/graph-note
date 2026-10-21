// GitHub can't read a workflow file whose map names a key twice. It then shows a failed run on every push, with no
// job run and no error in the log (#847). This test reads each workflow's keys by their indent, with no YAML library.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { path, read } from './repository/repo.js';

/** The keys a YAML text names twice in one map, as `line: key`. Block text (`run: |`) is skipped. */
export function repeatedKeys(text) {
  const repeats = [];
  let maps = []; // the open maps, outermost first: { indent, keys }
  let blockAbove = -1; // the indent of a key whose block text follows, or -1
  text.split('\n').forEach((line, i) => {
    if (!line.trim() || line.trim().startsWith('#')) return;
    let indent = line.search(/\S/);
    if (blockAbove >= 0 && indent > blockAbove) return;
    blockAbove = -1;
    let rest = line.slice(indent);
    maps = maps.filter((m) => m.indent < indent || (m.indent === indent && !rest.startsWith('- ')));
    // a list item opens a new map for the keys after its dash
    while (rest.startsWith('- ')) {
      indent += 2;
      rest = rest.slice(2);
      maps = maps.filter((m) => m.indent < indent);
    }
    const key = /^([\w.-]+|'[^']*'|"[^"]*"):(\s|$)/.exec(rest)?.[1];
    if (!key) return;
    let map = maps.at(-1);
    if (map?.indent !== indent) maps.push((map = { indent, keys: new Set() }));
    if (map.keys.has(key)) repeats.push(`${i + 1}: ${key}`);
    map.keys.add(key);
    if (/:\s*[|>][-+]?\s*(#.*)?$/.test(rest)) blockAbove = indent;
  });
  return repeats;
}

test('the key check finds a key named twice in one map, and not the same key in two maps', () => {
  assert.deepEqual(repeatedKeys('jobs:\n  a:\n    needs: x\n    needs: x\n'), ['4: needs']);
  assert.deepEqual(repeatedKeys('jobs:\n  a:\n    needs: x\n  b:\n    needs: x\n'), []);
  assert.deepEqual(repeatedKeys('steps:\n  - uses: a\n    with: 1\n  - uses: b\n    with: 2\n'), []);
  assert.deepEqual(repeatedKeys('run: |\n  a: 1\n  a: 1\nnext: 2\n'), []);
});

test('no workflow names a key twice in one map, so GitHub can read every workflow file', () => {
  const dir = '.github/workflows';
  const found = readdirSync(path(dir))
    .filter((f) => /\.ya?ml$/.test(f))
    .flatMap((f) => repeatedKeys(read(`${dir}/${f}`)).map((r) => `${f}:${r}`));
  assert.deepEqual(found, []);
});
