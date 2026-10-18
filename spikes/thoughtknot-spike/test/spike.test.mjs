// The phone spike: a throwaway plugin that draws a `graphviz-spike` code block with the Graphviz
// WebAssembly engine and prints how long the engine took to start and to draw. It answers one
// question before slice 1 is built — is the engine fast and small enough on a phone? Here it is
// built and loaded with stand-ins for Obsidian and the browser's SVG parser, and draws two graphs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const dir = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);

test('the spike builds into a plugin folder the install script accepts', () => {
  const r = spawnSync(process.execPath, ['esbuild.config.mjs'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  for (const f of ['main.js', 'manifest.json', 'styles.css']) assert.ok(existsSync(`${dir}${f}`), f);
  const manifest = JSON.parse(readFileSync(`${dir}manifest.json`, 'utf8'));
  assert.equal(manifest.id, 'thoughtknot-spike');
  assert.equal(manifest.isDesktopOnly, false, 'it must run on the phone');
  assert.ok(statSync(`${dir}main.js`).size > 1_000_000, 'the engine is bundled in, so the phone needs no network');
});

test('loaded in a stand-in Obsidian, it draws a code block and reports the times', async () => {
  const Module = require('node:module');
  const real = Module._load;
  let processor;
  Module._load = (req, ...rest) => (req === 'obsidian'
    ? { Plugin: class { registerMarkdownCodeBlockProcessor(lang, fn) { processor = [lang, fn]; } } }
    : real(req, ...rest));
  globalThis.DOMParser = class { parseFromString(s) { return { documentElement: { svg: s, style: {} } }; } };
  try {
    const Spike = require(`${dir}main.js`).default;
    new Spike().onload();
  } finally {
    Module._load = real;
  }
  const [lang, draw] = processor;
  assert.equal(lang, 'graphviz-spike');
  const el = () => { const kids = []; return { kids, appendChild: (c) => kids.push(c), createEl: (tag, o) => { const e = { tag, text: o?.text }; kids.push(e); return e; } }; };
  const small = el();
  await draw('digraph { a -> b [label="answers"]; c -> a [label="favours"]; }', small);
  assert.match(small.kids[0].svg, /<svg/);
  assert.match(small.kids[1].text, /^Graphviz \d+\.\d+\.\d+ · engine start \d+ ms · drawn in \d+\.\d ms$/);
  const nodes = Array.from({ length: 50 }, (_, i) => `n${i} [shape=box, label="Thing ${i}"];`).join(' ');
  const edges = Array.from({ length: 70 }, (_, i) => `n${i % 50} -> n${(i * 7 + 3) % 50};`).join(' ');
  const big = el();
  await draw(`digraph { rankdir=LR; ${nodes} ${edges} }`, big);
  assert.match(big.kids[0].svg, /<svg/);
});
