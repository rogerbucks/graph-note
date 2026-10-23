// The tab's page, made ready for a webview (spec §41, vscode_plugin). Its files are named by their webview address,
// the extension's script runs first, and its policy allows only the extension's own files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contentPolicy, webviewHtml } from '../src/webview-html.ts';

const PAGE = readFileSync(new URL('../../claude-code/page/index.html', import.meta.url), 'utf8');
const SETTINGS = { base: 'https://file.example/ext/dist/webview', note: 'a/Reader.md', language: 'de' };

test('every file of the page is named under the webview address, and the extension’s script runs first', () => {
  const html = webviewHtml(PAGE, SETTINGS, 'https://file.example', 'n0nce');
  assert.match(html, /<html lang="de"/);
  assert.match(html, /href="https:\/\/file.example\/ext\/dist\/webview\/page.css"/);
  const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(scripts, [`${SETTINGS.base}/vscode-editor.js`, `${SETTINGS.base}/page.js`]);
  assert.doesNotMatch(html, /(src|href)="\//, 'no file is named from the webview’s own address');
});

test('the settings travel as JSON a note’s name cannot break out of', () => {
  const html = webviewHtml(PAGE, { ...SETTINGS, note: '</script><script>alert(1)</script>.md' }, 'x', 'n');
  assert.equal(html.match(/<\/script>/g).length, html.match(/<script/g).length);
  const block = /<script id="thoughtknot-vscode"[^>]*>([^<]*)<\/script>/.exec(html)[1];
  assert.equal(JSON.parse(block).note, '</script><script>alert(1)</script>.md');
});

test('the policy allows the extension’s files, scripts carrying the number, and workers from a blob alone', () => {
  const policy = contentPolicy('https://file.example', 'n0nce');
  assert.match(policy, /^default-src 'none'/);
  assert.match(policy, /script-src 'nonce-n0nce' https:\/\/file.example 'wasm-unsafe-eval'/);
  assert.match(policy, /worker-src blob:/);
  assert.doesNotMatch(policy, /script-src[^;]*'unsafe-inline'/);
});
