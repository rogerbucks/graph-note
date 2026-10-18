// One whitespace set in every reader (spec §3). The core, the JavaScript library and the Python library each hold a
// copy of the code points, written out by hand. Those copies must stay the same as each other, and as the set openGQL's
// grammar names (GQL.g4, rule WHITESPACE and its fragments). U+0085 and U+FEFF are not in it (decided 10 Oct 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { SPACE } from '../packages/core/src/whitespace.ts';

const require = createRequire(import.meta.url);
const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const GRAMMAR = 'https://raw.githubusercontent.com/opengql/grammar/main/GQL.g4';
const COPIES = {
  core: '../packages/core/src/whitespace.ts',
  library: '../packages/graph-spec/src/reader/whitespace.js',
  python: '../python/graph_spec/src/graphspec/reader/whitespace.py',
};

// WHITESPACE in openGQL's GQL.g4: SPACE, TAB, LF, VT, FF, CR, FS, GS, RS, US and the Unicode spaces it lists by code
const GQL = [
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0xa0, 0x1680, 0x180e, 0x2000, 0x2001, 0x2002, 0x2003,
  0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
];
const codes = (s) => [...s].map((c) => c.codePointAt(0) ?? 0).sort((a, b) => a - b);

test('the three copies hold the same 29 code points, the ones openGQL’s grammar names', () => {
  const library = require(here(COPIES.library)).S.slice(1, -1);
  const py = spawnSync(
    'python3',
    [
      '-c',
      `import json, sys\nsys.path.insert(0, ${JSON.stringify(here('../python/graph_spec/src'))})\n` +
        'from graphspec.reader.whitespace import SPACE\nprint(json.dumps([ord(c) for c in SPACE]))',
    ],
    { encoding: 'utf8' },
  );
  assert.equal(py.status, 0, py.stderr);
  assert.deepEqual(codes(SPACE), GQL, 'the core');
  assert.deepEqual(codes(library), GQL, 'the JavaScript library');
  assert.deepEqual(
    JSON.parse(py.stdout).sort((a, b) => a - b),
    GQL,
    'the Python library',
  );
});

test('each copy names openGQL’s GQL.g4 as the source of its set', () => {
  for (const [name, rel] of Object.entries(COPIES))
    assert.ok(readFileSync(here(rel), 'utf8').includes(GRAMMAR), `${name} (${rel}) cites ${GRAMMAR}`);
});
