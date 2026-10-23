// The libraries' runnable examples (risk API-12). Each one reads a graph block, checks it and exits non-zero when a
// rule fails. So a doc that drifts from the API fails a build, not a reader.
// - The JavaScript example runs here. The Python one runs where `uv` is found, and in CI always.
// - CI's `examples` job runs every file in examples/js and examples/python, from the release archive's layout.
// - Each library's GUIDE points at its example.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const files = (dir) => readdirSync(dir).map((name) => `${dir}/${name}`);
const EXAMPLES = [...files('examples/js'), ...files('examples/python')];

/** A run of `command` from the repository, with its exit code and what it printed. */
const run = (command, args) => spawnSync(command, args, { encoding: 'utf8', timeout: 120_000 });

test('the JavaScript example reads and checks a block, every rule passing', () => {
  const r = run(process.execPath, ['examples/js/read-and-check.cjs']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^✓ §5/m);
  assert.doesNotMatch(r.stdout, /^✗/m);
});

test('the Python example reads and checks the same block, with the same rules passing', (t) => {
  if (run('uv', ['--version']).error) return t.skip('uv is not installed here; CI’s examples job runs it');
  const js = run(process.execPath, ['examples/js/read-and-check.cjs']).stdout;
  const py = run('uv', [
    'run',
    '--locked',
    '--project',
    'python/graph_spec',
    'python',
    'examples/python/read_and_check.py',
  ]);
  assert.equal(py.status, 0, py.stderr);
  assert.equal(py.stdout, js);
});

test('CI’s examples job runs every example, from the release archive’s layout, never waiting on the plan', () => {
  const ci = read('.github/workflows/ci.yml');
  const job = ci.split('\n  examples:\n')[1]?.split(/\n {2}[\w-]+:\n/)[0] ?? '';
  assert.ok(job, 'ci.yml has an examples job');
  assert.doesNotMatch(job, /needs:/);
  assert.match(job, /git archive .*--add-file=packages\/graph-spec\/dist\/graph-spec-check\.js/);
  for (const file of EXAMPLES) assert.ok(job.includes(`python ${file}`) || job.includes(`node ${file}`), file);
});

test('each library’s GUIDE points at its example', () => {
  assert.match(read('packages/graph-spec/GUIDE.md'), /examples\/js\/read-and-check\.cjs/);
  assert.match(read('python/graph_spec/GUIDE.md'), /examples\/python\/read_and_check\.py/);
});
