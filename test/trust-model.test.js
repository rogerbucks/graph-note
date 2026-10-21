// The trust model (spec §54): who and what each part of ThoughtKnot trusts. The page is wiki/Trust-model.md. It names
// each actor and each trust boundary, what crosses it and what each side trusts. Every gap it found is a risk in the
// register, marked fix now or fix later (trust_model_reviewed). Every file that opens a boundary is named on the page,
// so a new one missing from it fails here (trust_model_kept_current). Pure: the real files are read, nothing is fetched.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { exists, read, readJSON } from './repository/repo.js';

const PAGE = 'wiki/Trust-model.md';
const page = exists(PAGE) ? read(PAGE) : '';
const { risks } = readJSON('quality/risks.json');

/** The actors the trust model must name, as the requirement lists them. */
const ACTORS = [
  'the person',
  'Obsidian',
  'the Claude Code mod',
  'the editor server',
  'Claude',
  'AI models',
  'plug-ins',
  'joined graphs',
  'peers',
  'servers',
  'GitHub',
];

/** The page's boundaries: each `### B<n>.` heading with the text under it. */
const boundaries = () =>
  [...page.matchAll(/^### (B\d+)\. (.+)\n([\s\S]*?)(?=^### |^## |(?![\s\S]))/gm)].map(([, id, name, body]) => ({
    id,
    name,
    body,
  }));

/** The risk ids a piece of text names, such as SEC-4 or TRUST-1. */
const riskIds = (text) => [...new Set(text.match(/\b[A-Z]+-\d+\b/g) ?? [])];

/** The files a boundary opens: code that reaches the network, starts a process or serves on a port. */
const OPENS = [
  /\bspawn\(/,
  /\bexecFile/,
  /\bfetch\(/,
  /\brequestUrl\(/,
  /child_process/,
  /\bcreateServer\(/,
  /node:https?\b/,
  /node:net\b/,
  /\bWebSocket\b/,
  /^import subprocess\b/m,
  /\burllib\b/,
];
const CODE = [
  'packages/claude-code/src',
  'packages/claude-code/server',
  'packages/claude-code/page',
  'packages/claude-code/bin',
  'packages/claude-code/mod/hooks',
  'packages/core/src',
  'packages/graph-spec/src',
  'packages/obsidian/src',
  'python/graph_spec/src',
];
/** The built files, never read (AGENTS.md). */
const BUILT = new Set(['packages/claude-code/mod/hooks/graph.js']);
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name).replaceAll('\\', '/');
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx|js|mjs|py)$/.test(name) && !BUILT.has(path) ? [path] : [];
  });
const openingFiles = () =>
  CODE.filter((dir) => exists(dir))
    .flatMap(walk)
    .filter((file) => OPENS.some((re) => re.test(read(file))));
/** The workflows that hold a secret other than the run's own token. */
const secretWorkflows = () =>
  readdirSync('.github/workflows')
    .map((f) => `.github/workflows/${f}`)
    .filter((f) => /secrets\.(?!GITHUB_TOKEN\b)/.test(read(f)));

describe('the trust model page', () => {
  test('is in the wiki and names every actor', () => {
    assert.ok(page, `${PAGE} is missing`);
    for (const actor of ACTORS) assert.ok(page.includes(actor), `the page does not name ${actor}`);
  });

  test('says for each boundary what crosses it, what each side trusts, its controls and its gaps', () => {
    const found = boundaries();
    assert.ok(found.length >= 10, `only ${found.length} boundaries`);
    for (const b of found)
      for (const label of ['**Sides:**', '**Crosses:**', '**Trusted:**', '**Controls:**', '**Gaps:**'])
        assert.ok(b.body.includes(label), `${b.id} has no ${label}`);
  });
});

describe('the trust model review', () => {
  test('puts each gap it found in the register, marked fix now or fix later', () => {
    const byId = new Map(risks.map((r) => [r.id, r]));
    const named = boundaries().flatMap((b) => {
      const gaps = /\*\*Gaps:\*\*([\s\S]*)/.exec(b.body)?.[1] ?? '';
      return gaps
        .split(/\n(?=\s*- )/)
        .filter((line) => /^\s*- /.test(line) && !/^\s*- None\b/.test(line))
        .map((line) => ({ at: b.id, line, ids: riskIds(line) }));
    });
    assert.ok(named.length, 'the page names no gap');
    for (const gap of named) {
      assert.ok(gap.ids.length, `${gap.at}: a gap names no risk: ${gap.line.trim()}`);
      for (const id of gap.ids) {
        const risk = byId.get(id);
        assert.ok(risk, `${gap.at}: ${id} is not in the register`);
        assert.ok(
          ['fix-now', 'fix-later'].includes(risk.decision) || risk.status !== 'open',
          `${id} is open but marked ${risk.decision}`,
        );
      }
    }
    for (const r of risks.filter((r) => r.id.startsWith('TRUST-')))
      assert.ok(page.includes(r.id), `${r.id} is in the register but not on the page`);
  });
});

describe('the trust model kept current', () => {
  test('names every file that opens a trust boundary', () => {
    const files = openingFiles();
    assert.ok(files.length, 'no file was found that opens a boundary: the scan is wrong');
    for (const file of files) assert.ok(page.includes(`\`${file}\``), `${file} opens a boundary the page never names`);
  });

  test('names every workflow that holds a secret', () => {
    for (const file of secretWorkflows())
      assert.ok(page.includes(`\`${file}\``), `${file} holds a secret the page never names`);
  });

  test('fails when a new boundary is missing from the page', () => {
    const fake = 'packages/core/src/new-door.ts';
    const text = "import { request } from 'node:https';";
    assert.ok(
      OPENS.some((re) => re.test(text)),
      'the scan misses a new network module',
    );
    assert.ok(!page.includes(`\`${fake}\``));
  });
});
