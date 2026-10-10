#!/usr/bin/env node
// Measures the code's quality metrics (spec §12, quality_ratchet and slice_end_review): file sizes, a dependency
// vulnerability scan, a secrets scan, the plugin's bundle size, the time to draw a graph of 50 things, the test suite's
// duration, its flaky tests and the size of a passing quiet run, and coverage. The result is the metrics JSON that
// scripts/quality-check.mjs holds against quality/baseline.json, and that the slice-end review reads.
//
// Usage:
//   node scripts/quality-metrics.mjs                       measure everything, print the JSON
//   node scripts/quality-metrics.mjs --out quality/metrics.json   write it to a file instead
//   node scripts/quality-metrics.mjs --fast                only the quick metrics, from the files (no audit, build or suite)
//
// The audit reaches the npm registry, and the suite runs twice (a minute or so): this is the release's job, not CI's.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { METRICS } from './quality-spec.mjs';
import { scanRepo, scannedFiles } from './quality-secrets.mjs';
import { measureSuite } from './quality-suite.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ABOUT =
  'Measured by scripts/quality-metrics.mjs. quality/baseline.json is the committed copy of a run, the figures every release is held to by scripts/quality-check.mjs; a worse figure needs a reason in quality/accepted.json. To move the baseline, re-run the script with --out quality/baseline.json.';

const lines = (file) => readFileSync(join(ROOT, file), 'utf8').split('\n').length;
const SOURCE =
  /^(?:packages\/[^/]+\/(?:src|bin)\/.+\.(?:ts|js|mjs)|python\/[^/]+\/src\/.+\.py|scripts\/[^/]+\.(?:js|mjs))$/;
const TEST = /^(?:packages\/[^/]+\/test\/.+\.(?:js|mjs)|python\/[^/]+\/tests\/.+\.py|test\/.+\.(?:js|mjs))$/;

/** The largest of the files that match, by lines: its length and its name. */
function largest(files, pattern) {
  let best = { lines: 0, file: '' };
  for (const f of files.filter((f) => pattern.test(f) && !f.endsWith('.d.ts'))) {
    const n = lines(f);
    if (n > best.lines) best = { lines: n, file: f };
  }
  return best;
}

/** The quick metrics, from the files alone: the largest source and test file, and the secrets in the repository. */
export function measureFast() {
  const files = scannedFiles(ROOT);
  const source = largest(files, SOURCE),
    test = largest(files, TEST);
  const secrets = scanRepo(ROOT); // file, line and kind only: what matched is never kept
  return {
    metrics: { max_source_lines: source.lines, max_test_lines: test.lines, secrets_found: secrets.length },
    details: { max_source_file: source.file, max_test_file: test.file, secrets },
  };
}

/** Vulnerabilities in the dependencies, by severity, from `npm audit`. Fails if the registry cannot be asked. */
function measureAudit() {
  const r = spawnSync('npm', ['audit', '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
  let report;
  try {
    report = JSON.parse(r.stdout);
  } catch {
    throw new Error(`npm audit gave no report: ${r.stderr.trim().split('\n')[0]}`);
  }
  const counts = report.metadata?.vulnerabilities;
  if (!counts)
    throw new Error(`npm audit could not be completed: ${report.error?.summary ?? 'no counts in its report'}`);
  return {
    metrics: {
      audit_critical: counts.critical,
      audit_high: counts.high,
      audit_moderate: counts.moderate,
      audit_low: counts.low,
    },
    details: { audited_total: counts.total },
  };
}

/** The package, or the folder of our own code, that an input of the bundle belongs to: for saying what is large in it. */
function owner(input) {
  const modules = input.lastIndexOf('node_modules/');
  if (modules >= 0)
    return input
      .slice(modules + 13)
      .split('/')
      .slice(0, input[modules + 13] === '@' ? 2 : 1)
      .join('/');
  return dirname(relative(ROOT, resolve(ROOT, 'packages/obsidian', input))); // the build runs from the plugin's folder
}

/** The plugin's bundle, built in memory with the build's own options: its size, without the engine, and what is in it. */
export async function measureBundle() {
  const { default: esbuild } = await import('esbuild');
  const { options, layoutWorker, workerBuild } = await import('../packages/obsidian/esbuild.config.mjs');
  // the layout worker's bundle is built with the plugin (spec §9); only the writing of main.js is left out
  const built = await esbuild.build({
    ...options,
    plugins: [layoutWorker],
    metafile: true,
    logLevel: 'silent',
    write: false,
  });
  const total = built.outputFiles[0].contents.length;
  const bytes = new Map();
  const add = (metafile) => {
    for (const out of Object.values(metafile.outputs))
      for (const [input, { bytesInOutput }] of Object.entries(out.inputs))
        if (!input.startsWith('layout-worker:'))
          bytes.set(owner(input), (bytes.get(owner(input)) ?? 0) + bytesInOutput);
  };
  // the worker's function is counted by what is inside it, so the engine there is still the engine
  add(built.metafile);
  add(workerBuild.metafile);
  const viz = bytes.get('@viz-js/viz') ?? 0;
  return {
    metrics: { bundle_bytes: total, bundle_bytes_without_viz: total - viz },
    details: {
      bundle: [...bytes]
        .filter(([, b]) => b > 0)
        .map(([name, b]) => ({ name, bytes: b }))
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 12),
    },
  };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** How long a fixed piece of plain work takes here, in ms: what the timings are scaled by when machines differ. */
function measureSpeed() {
  const runs = Array.from({ length: 7 }, () => {
    const t = performance.now();
    let h = 0;
    for (let i = 0; i < 3e6; i++) h = (Math.imul(h ^ i, 16777619) + (i >> 3)) | 0;
    if (h === 1) console.log(h); // the result is used, so the loop is not removed
    return performance.now() - t;
  });
  return Math.round(Math.min(...runs) * 100) / 100;
}

/** The time to read and draw a graph of 50 things, 70 links, as the core's render path does it (render.test.js). */
async function measureDraw() {
  const { readNote } = await import('../packages/core/src/drawing.ts');
  const [{ loadEngine }, { draw }] = await Promise.all([
    import('../packages/core/src/engine.ts'),
    import('../packages/core/src/render.ts'),
  ]);
  const engine = await loadEngine();
  const kinds = ['Question', 'Option', 'Reason', 'Claim', 'Source'],
    types = ['ANSWERS', 'FAVOURS', 'CITES'];
  const nodes = Array.from({ length: 50 }, (_, i) => `(n${i}:${kinds[i % 5]} {name: 'Thing ${i}, a few words long'})`);
  const links = Array.from({ length: 70 }, (_, i) => `(n${i % 50})-[:${types[i % 3]}]->(n${(i * 7 + 3) % 50})`);
  const block = `// graph: g\n${[...nodes, ...links].join(',\n')}`;
  const once = () => draw(readNote([block]).graphs.get('g'), engine);
  once();
  once(); // warm: the first draws compile the engine's code paths
  const times = Array.from({ length: 9 }, () => {
    const t = performance.now();
    once();
    return performance.now() - t;
  });
  return { metrics: { draw_ms: Math.round(median(times) * 10) / 10 }, details: {} };
}

/** Everything: the quick metrics, the audit, the bundle, the drawing, the machine's speed, and the suite (twice). */
export async function measureAll() {
  const parts = [measureFast(), measureAudit(), await measureBundle(), await measureDraw(), measureSuite(ROOT)];
  const metrics = Object.assign({}, ...parts.map((p) => p.metrics), { speed_index: measureSpeed() });
  const details = Object.assign({}, ...parts.map((p) => p.details));
  return { metrics, details };
}

async function main(argv) {
  const fast = argv.includes('--fast');
  const out = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null;
  const { metrics, details } = fast ? measureFast() : await measureAll();
  if (details.failing?.length) {
    console.error(`the suite fails, so its metrics mean nothing:\n${details.failing.join('\n')}`);
    return 1;
  }
  const result = {
    about: ABOUT,
    measured: new Date().toISOString().slice(0, 10),
    node: process.version,
    // timings are only held against a baseline measured on the same operating system and Node major
    machine: { os: process.platform, node_major: Number(process.versions.node.split('.')[0]) },
    metrics: Object.fromEntries(
      Object.keys(METRICS)
        .filter((k) => k in metrics)
        .map((k) => [k, metrics[k]]),
    ),
    details,
  };
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (out) writeFileSync(resolve(ROOT, out), text);
  else process.stdout.write(text);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
