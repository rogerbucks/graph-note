// The editor tests' own support (editor-mod-support.js). The servers they start serve the page the build makes, in
// `mod/page/`. A fresh checkout does not hold it until something builds it. In CI the suite runs before `npm run build`.
// So only the build's own test made it, at the same time as these tests started servers. A server started first
// refused to start (the page is not built). The support makes sure of the page before any server is started.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPageAssets } from '../server/page-assets.ts';
import { PAGE, pageReady } from './editor-mod-support.js';

/** A folder removed when the test ends. */
function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'editor-mod-page-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('a page folder that is not there is built, so a server started next finds the page', async (t) => {
  const folder = join(scratch(t), 'page');
  assert.equal((await loadPageAssets(folder)).has('/'), false);
  await pageReady(folder);
  assert.equal((await loadPageAssets(folder)).has('/'), true);
});

test('a page already built is left as it is', async (t) => {
  const folder = join(scratch(t), 'page');
  await pageReady(folder);
  const before = statSync(join(folder, 'page.js')).mtimeMs;
  await pageReady(folder);
  assert.equal(statSync(join(folder, 'page.js')).mtimeMs, before);
});

test('the page the servers serve is there once the support is loaded', async () => {
  assert.equal((await loadPageAssets(PAGE)).has('/'), true);
});
