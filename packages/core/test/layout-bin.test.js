// The layout source as a Node program (spec §12, "same layout as Python"). The vault's conformance suite sends it every
// note and every shared schema. It compares each graph's layout source with graph_svg.py's. One JSON request on stdin,
// one JSON answer on stdout, as the graph library's own Node harness works.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gqlBlocks } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { layoutSource } from '../src/layout.ts';

const BIN = fileURLToPath(new URL('../bin/layout-source-node.mjs', import.meta.url));
const run = (request) => {
  const r = spawnSync(process.execPath, [BIN], { input: JSON.stringify(request), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};
const fence = (t) => '```gql\n' + t + '\n```';

const NOTE = [
  fence("// graph: reader\n(q:Question {title: 'Which?'}), (o:Option {name: 'A'}), (o)-[:ANSWERS]->(q)"),
  'Text.',
  fence('// graph: other · schema shared_reader\n(x:Thing), (y:Thing), (x)-[:SEES]->(y)'),
].join('\n');
const SHARED =
  "// graph: shared · SCHEMA shared_reader\n(t:Meta:ElementType {name: 'SEES', kind: 'edge', reading: 'can see', reverse_name: 'is seen by'})";

test('each graph of each note, laid out across and down, exactly as the core lays it out', () => {
  const answer = run({ notes: { 'Reader.md': NOTE }, shared: [SHARED] });
  const reading = readNote(
    gqlBlocks(NOTE).map((b) => b.text),
    undefined,
    [SHARED],
  );
  assert.deepEqual(Object.keys(answer['Reader.md']).sort(), ['other', 'reader']);
  for (const [graph, d] of reading.graphs) {
    for (const rd of ['LR', 'TB'])
      assert.equal(answer['Reader.md'][graph][rd], layoutSource(d, rd).source, `${graph} ${rd}`);
  }
  assert.match(answer['Reader.md'].other.LR, /label="can see"/, 'a shared schema gives its readings');
});

test('a note that cannot be read says so, and the others are still answered', () => {
  const answer = run({ notes: { 'Good.md': NOTE, 'Empty.md': '# no graphs' } });
  assert.deepEqual(answer['Empty.md'], {});
  assert.ok(answer['Good.md'].reader);
});

test('bundled into one file, it runs with nothing beside it — as the vault runs its vendored copy', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const b = spawnSync('npm', ['run', 'build:layout'], { cwd: root, encoding: 'utf8' });
  assert.equal(b.status, 0, b.stderr);
  const dir = mkdtempSync(join(tmpdir(), 'layout-')),
    alone = join(dir, 'layout-source-node.cjs');
  try {
    copyFileSync(join(root, 'packages/core/dist/layout-source-node.cjs'), alone);
    const r = spawnSync(process.execPath, [alone], {
      cwd: dir,
      input: JSON.stringify({ notes: { 'Reader.md': NOTE }, shared: [SHARED] }),
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), run({ notes: { 'Reader.md': NOTE }, shared: [SHARED] }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
