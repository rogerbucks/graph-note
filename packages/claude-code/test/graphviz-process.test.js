// Graphviz for the Claude Code host, run as a process through node (spec §10; decision of 11 Oct 2026): the core's own
// engine, DOT in and SVG out. When node is missing the host says so in words, and never shows a blank drawing.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { layOut, NODE_MISSING, RENDER_SCRIPT, LAYOUT_TIMEOUT_MS, VERSION_TIMEOUT_MS } from '../src/graphviz-process.ts';

const DOT = 'digraph { a -> b }';
const ok = (stdout) => ({ exitCode: 0, stdout, stderr: '' });

/** Runs a command as the host would: argv, stdin in, the whole output back; rejects when it cannot start. */
function run(argv, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1));
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (exitCode) => resolve({ exitCode, stdout, stderr }));
    child.stdin.end(stdin);
  });
}

describe('running Graphviz', () => {
  test('the render script is run with node, the DOT sources handed in as a JSON list', async () => {
    const calls = [];
    const laid = await layOut([DOT, DOT], '/mod', async (argv, stdin) => {
      calls.push({ argv, stdin });
      return ok(JSON.stringify(['<svg>1</svg>', '<svg>2</svg>']));
    });
    assert.deepEqual(laid, { svgs: ['<svg>1</svg>', '<svg>2</svg>'] });
    assert.deepEqual(calls, [{ argv: ['node', `/mod/${RENDER_SCRIPT}`], stdin: JSON.stringify([DOT, DOT]) }]);
  });

  test("the render script is the core's own engine: DOT in, SVG out, through node", async () => {
    const script = fileURLToPath(new URL('../bin/render-process.ts', import.meta.url));
    const r = await run(['node', script], JSON.stringify([DOT]));
    assert.equal(r.exitCode, 0, r.stderr);
    const [svg] = JSON.parse(r.stdout);
    assert.match(svg, /^<\?xml[\s\S]*<svg [\s\S]*<\/svg>\s*$/);
  });
});

describe('when node is missing', () => {
  test('a node that cannot start is said in words, with what to do', async () => {
    const tried = [];
    const laid = await layOut([DOT], '/mod', async (argv) => {
      tried.push(argv[0]);
      throw new Error('spawn node ENOENT');
    });
    assert.deepEqual(laid, { why: NODE_MISSING });
    assert.match(NODE_MISSING, /Node\.js/);
    assert.match(NODE_MISSING, /install/i);
    assert.ok(tried.every((c) => c === 'node'));
  });

  test('so is the shell’s "command not found", exit code 127', async () => {
    assert.deepEqual(await layOut([DOT], '/mod', async () => ({ exitCode: 127, stdout: '', stderr: '' })), {
      why: NODE_MISSING,
    });
  });

  test('a process the host will not run is not called a missing node: what the host said is shown', async () => {
    const laid = await layOut([DOT], '/mod', async () => {
      throw new Error('process.run was denied by a hook');
    });
    assert.notEqual(laid.why, NODE_MISSING);
    assert.match(laid.why, /^Could not run node: process\.run was denied by a hook/);
  });

  test('the check that node starts is given a short time of its own', async () => {
    const asked = [];
    await layOut([DOT], '/mod', async (argv, _stdin, timeoutMs) => {
      asked.push([argv[1], timeoutMs]);
      throw new Error('spawn node ENOENT');
    });
    assert.deepEqual(asked, [
      [`/mod/${RENDER_SCRIPT}`, LAYOUT_TIMEOUT_MS],
      ['--version', VERSION_TIMEOUT_MS],
    ]);
    assert.ok(VERSION_TIMEOUT_MS <= 5000);
  });

  test('output cut short by the host is said so, not called a bad drawing', async () => {
    const laid = await layOut([DOT], '/mod', async () => ({ ...ok('["<svg'), isStdoutTruncated: true }));
    assert.match(laid.why, /too large to hand back/);
  });

  test('a node that starts but whose layout does not finish is not called missing', async () => {
    const laid = await layOut([DOT], '/mod', async (argv) => {
      if (argv[1] === '--version') return ok('v24.1.0\n');
      throw new Error('timed out after 30000 ms');
    });
    assert.notEqual(laid.why, NODE_MISSING);
    assert.match(laid.why, /timed out after 30000 ms/);
  });

  test('a failed layout says what Graphviz said, cut short', async () => {
    const laid = await layOut([DOT], '/mod', async () => ({
      exitCode: 1,
      stdout: '',
      stderr: 'syntax error\n'.repeat(80),
    }));
    assert.match(laid.why, /^Graphviz failed: syntax error/);
    assert.ok(laid.why.length <= 240);
  });

  test('output that is not one SVG for each source is refused, not drawn', async () => {
    for (const stdout of ['', 'nonsense', '[]', JSON.stringify([1])]) {
      const laid = await layOut([DOT], '/mod', async () => ok(stdout));
      assert.match(laid.why ?? '', /no drawing/, stdout);
    }
  });
});
