// The browser harness's stand-in for Obsidian (harness/obsidian-shim.js) keeps up with the plugin: the harness builds
// against it, and the plugin loads on it. Both fail here, not in a browser, when the plugin starts to use more of
// Obsidian than the shim stands in for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';
import { layoutWorker } from '../esbuild.config.mjs';
import { fakeDocument, installGlobals } from './host/fake-dom.js';
import { root } from './host/load-plugin.js';

const harness = `${root}packages/obsidian/harness`;

test('the harness builds against the shim, with no export the plugin imports missing', (t) => {
  const out = mkdtempSync(join(tmpdir(), 'graph-note-harness-'));
  t.after(() => rmSync(out, { recursive: true, force: true }));
  const r = spawnSync(process.execPath, [`${harness}/build.mjs`, out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /No matching export|ERROR/);
});

test('the plugin loads on the shim, and reads the vault as it does in Obsidian', async (t) => {
  const out = mkdtempSync(join(tmpdir(), 'graph-note-shim-'));
  const doc = fakeDocument(700);
  // CodeMirror, bundled here as in the harness, reads the page's root style once as it loads to tell browsers apart
  doc.documentElement.style ??= {};
  const uninstall = installGlobals(doc);
  t.after(() => {
    uninstall();
    rmSync(out, { recursive: true, force: true });
  });
  // the plugin and the shim, bundled as build.mjs bundles the harness
  const entry = join(out, 'entry.js');
  writeFileSync(
    entry,
    `export { default as Plugin } from ${JSON.stringify(`${root}packages/obsidian/src/main.ts`)};\n` +
      `export { files } from 'obsidian';\n`,
  );
  await esbuild.build({
    entryPoints: [entry],
    outfile: join(out, 'bundle.mjs'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    alias: { obsidian: `${harness}/obsidian-shim.js` },
    plugins: [layoutWorker],
    logLevel: 'silent',
  });
  const { Plugin, files } = await import(pathToFileURL(join(out, 'bundle.mjs')).href);
  files.set('Shared.md', '```gql\n// graph: schema · shared\n(:Option)\n```\n');
  const plugin = new Plugin();
  await plugin.onload();
  assert.ok(Array.isArray(await plugin.sharedSchemas()), 'the vault is read for shared schemas');
  assert.equal(plugin.app.workspace.getActiveFile(), null, 'no note is open in an Obsidian editor');
});
