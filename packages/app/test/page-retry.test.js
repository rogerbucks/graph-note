// The editor's page script, loaded again when the app's window failed to load it (spec §41, standalone_app). On Linux,
// in CI, the window sometimes refused `page.js` as `text/html`, so the editor never showed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { PAGE_TRIES, retryPageScript } from '../src/page-retry.ts';
import { editorHtml } from '../esbuild.config.mjs';

/** The editor's page as the app builds it, with its scripts never run. */
const page = () =>
  new JSDOM(editorHtml('<html><head><script type="module" src="/page.js"></script></head><body></body></html>')).window
    .document;
const pageScripts = (doc) => [...doc.querySelectorAll('script')].map((s) => s.getAttribute('src'));
const fail = (doc) =>
  doc.querySelectorAll('script')[pageScripts(doc).length - 1].dispatchEvent(new doc.defaultView.Event('error'));

test('a page script that failed to load is loaded again under a fresh address, and the failure is kept', () => {
  const doc = page();
  retryPageScript(doc);
  assert.deepEqual(pageScripts(doc), ['/app-editor.js', '/page.js']);
  fail(doc);
  assert.deepEqual(pageScripts(doc), ['/app-editor.js', '/page.js', '/page.js?try=1']);
  assert.equal(doc.querySelectorAll('script')[2].type, 'module');
  assert.equal(doc.documentElement.dataset.pageFailures, '1');
});

test('it gives up after its tries, saying how many failed', () => {
  const doc = page();
  retryPageScript(doc);
  for (let i = 0; i <= PAGE_TRIES; i++) fail(doc);
  assert.equal(pageScripts(doc).length, 2 + PAGE_TRIES);
  assert.equal(doc.documentElement.dataset.pageFailures, String(PAGE_TRIES + 1));
});

test('a page script that loads is left alone, and a page without one is no trouble', () => {
  const doc = page();
  retryPageScript(doc);
  doc.querySelectorAll('script')[1].dispatchEvent(new doc.defaultView.Event('load'));
  assert.deepEqual(pageScripts(doc), ['/app-editor.js', '/page.js']);
  assert.equal(doc.documentElement.dataset.pageFailures, undefined);
  retryPageScript(new JSDOM('<p>no scripts</p>').window.document);
});

test("the app's editor script watches the page script", async () => {
  const { readFileSync } = await import('node:fs');
  assert.match(
    readFileSync(new URL('../src/app-editor.ts', import.meta.url), 'utf8'),
    /^retryPageScript\(document\);$/m,
  );
});
