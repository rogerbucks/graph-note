// The built file, dist/graph-spec-check.js: the library's modules bundled into the one plain file the release archive
// ships at src/graph-spec-check.js, for the vault to vendor. Loaded as a page's script it sets the global
// GraphSpecCheck; required in Node it is the module, with no global; either way it answers as the source modules do.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { cases, changesetCase } from './cases.mjs';

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const require = createRequire(import.meta.url);
const source = require('../src/graph-spec-check.js');

// Built as the archive lays it out: the built file at src/graph-spec-check.js, beside bin/ and its Node adapter.
let dir, built, text;
before(() => {
  dir = mkdtempSync(join(tmpdir(), 'graph-spec-built-'));
  built = join(dir, 'src', 'graph-spec-check.js');
  const r = spawnSync(process.execPath, [here('../esbuild.check.mjs'), built], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  text = readFileSync(built, 'utf8');
  mkdirSync(join(dir, 'bin'));
  copyFileSync(here('../bin/graph-spec-check-node.js'), join(dir, 'bin', 'graph-spec-check-node.js'));
});
after(() => rmSync(dir, { recursive: true, force: true }));

const block = [
  '// graph: shelf',
  "(ada:Person {name: 'Ada'}),",
  "(notes:Book {title: 'Notes', published: DATE '1843-10-01'}),",
  '(ada)-[:WROTE]->(notes)',
].join('\n');
/** A few real calls — read a block, check it, hash it, refuse a bad one — answered as plain JSON. */
function answers(C) {
  const w = C.worldFromStore(C.read([block]));
  let refused;
  try {
    C.read(['// graph: shelf\n(ada:Person {name: })']);
  } catch (e) {
    refused = { profileError: e instanceof C.ProfileError, line: e.line, message: e.message };
  }
  return JSON.stringify({
    names: Object.keys(C),
    canon: C.canon(w.shelf),
    check: C.check(w, 'shelf', {}),
    views: C.views(w.shelf),
    sha256: C.sha256hex('graph spec ✓'),
    hash16: C.hash16({ b: [1, 'two'], a: null }),
    lint: C.lint("MATCH (n:Thing)\nSET n.at = ZONED DATETIME '2026-10-09T10:00:00Z'\nINSERT (on:Mark)"),
    refused,
  });
}

test('it says first that it is generated, and from what, so nobody edits it by hand', () => {
  assert.match(text.split('\n')[0], /^\/\/ Generated from packages\/graph-spec\/src by .+ — do not hand-edit\.$/);
});

test('it is one file: it requires nothing', () => {
  assert.doesNotMatch(text, /\brequire\(\s*['"]/);
});

test('as a script in a page, with no module or require, it sets the global GraphSpecCheck', () => {
  const page = vm.createContext({ TextEncoder }); // what a page has that the bare language has not
  vm.runInContext(text, page, { filename: 'graph-spec-check.js' });
  assert.equal(typeof page.GraphSpecCheck, 'object');
  assert.equal(answers(page.GraphSpecCheck), answers(source));
});

test('required in Node, it is the module, and sets no global', () => {
  const C = require(built);
  assert.equal(globalThis.GraphSpecCheck, undefined);
  assert.equal(answers(C), answers(source));
});

test('run by the Node adapter beside it, as in the archive, it gives every recorded answer', () => {
  const recorded = JSON.parse(readFileSync(here('./expected.json'), 'utf8'));
  const slug = (s) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  const run = (q) => {
    const r = spawnSync(process.execPath, [join(dir, 'bin', 'graph-spec-check-node.js')], {
      input: JSON.stringify(q),
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  for (const [name, q] of Object.entries(cases)) assert.deepEqual(run(q), recorded[slug(name)], name);
  const against = run(cases['a typed graph, read through every shortcut']).canon.library.slice(0, 16);
  assert.deepEqual(run(changesetCase(against)), recorded['a-change-set-current-and-stale']);
});
