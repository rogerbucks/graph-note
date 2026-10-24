// The home page's live demo (spec §41, site_demo):
// - Its note is made from the project's own graph files, each in a gql block under its heading.
// - Its page loads its own files only: a content security policy refuses anything from elsewhere, and no request
//   leaves the page.
// - The home page links to it, and the sitemap and llms.txt list it.
// - In a real browser it draws every graph with the plugin and opens the first in the edit pane. An edit there redraws
//   its card, and no policy is broken.
// Chrome is the one THOUGHTKNOT_CHROME names, or the first of the usual names on the PATH. Where none is found the
// browser case skips with one line, except in CI, where a missing Chrome fails.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { openWindow } from './repository/wcag.js';
import { path, read, readJSON } from './repository/repo.js';
import { DEMO_POLICY, SITE_URL, renderSite } from '../scripts/site.mjs';
import { GRAPHS, buildDemo, demoNote, harnessCss, iconsCss } from '../scripts/site-demo.mjs';
import { findChrome, startChrome } from '../scripts/chrome.mjs';

const made = () =>
  renderSite({
    template: read('site/index.html'),
    privacy: read('site/privacy.html'),
    demo: read('site/demo.html'),
    catalogue: readJSON('site/words.json'),
    version: '0.6.0',
    sha: 'abc1234',
    today: '2026-10-24',
  });
const pageOf = (html) => openWindow(html).window.document;

describe('the demo draws the project’s own graphs', () => {
  test('each graph it names is a file of the repository that starts with its graph’s name', () => {
    assert.ok(GRAPHS.length >= 2);
    for (const g of GRAPHS) {
      assert.ok(existsSync(path(g.file)), g.file);
      assert.match(read(g.file), /^\/\/ graph: \w+/, g.file);
    }
  });

  test('its note holds each graph, whole, in a gql block under its heading and its line', () => {
    const note = demoNote(read);
    for (const g of GRAPHS) {
      const block = `## ${g.heading}\n${g.lede}\n\`\`\`gql\n${read(g.file).replace(/\s+$/, '')}\n\`\`\``;
      assert.ok(note.includes(block), g.file);
    }
    assert.equal(note.match(/^```gql$/gm).length, GRAPHS.length);
  });

  test('refuses a file that names no graph, or holds a fence that would end its block early', () => {
    const one = (text) => () => demoNote(() => text, [{ file: 'x.gql', heading: 'X', lede: 'x' }]);
    assert.throws(one('(a:A)'), /x\.gql does not start with its graph's name/);
    assert.throws(one('// graph: x\n```\n(a:A)'), /x\.gql holds a fence/);
  });

  test('takes the harness’s Obsidian theme from its page, and paints one rule for each icon', () => {
    const css = harnessCss(read('packages/obsidian/harness/index.html'));
    assert.match(css, /\n:root \{\n {2}--text-normal: #222;/);
    assert.match(css, /:root\.dark \{/);
    assert.throws(() => harnessCss('<p>no style</p>'), /no style sheet/);
    const icons = iconsCss(['undo-2', 'search']);
    assert.match(icons, /\.demo-icon-undo-2 \{ --demo-icon: url\('icons\/undo-2\.svg'\); \}/);
    assert.match(icons, /mask: var\(--demo-icon, url\('icons\/unknown\.svg'\)\)/);
  });
});

describe('the demo page loads its own files only', () => {
  const html = () => made()['demo.html'];

  test('is made from the catalogue, at its own address, with no placeholder left', () => {
    assert.doesNotMatch(html(), /\{\{|\}\}/);
    const doc = pageOf(html());
    assert.equal(doc.querySelector('link[rel=canonical]').getAttribute('href'), `${SITE_URL}demo.html`);
    assert.match(doc.querySelector('h1').textContent, /Try ThoughtKnot in your browser/);
    assert.match(doc.querySelector('main').textContent, /Nothing you type is sent or kept/);
  });

  test('carries a policy that refuses every script, style, frame and request from elsewhere', () => {
    const meta = pageOf(html()).querySelector('meta[http-equiv="Content-Security-Policy"]');
    assert.equal(meta.getAttribute('content'), DEMO_POLICY);
    const rules = Object.fromEntries(DEMO_POLICY.split('; ').map((r) => [r.split(' ')[0], r.split(' ').slice(1)]));
    assert.deepEqual(rules['default-src'], ["'none'"]);
    assert.deepEqual(rules['script-src'], ["'self'", "'wasm-unsafe-eval'"]);
    assert.deepEqual(rules['connect-src'], ["'self'", 'data:', 'blob:']);
    assert.deepEqual(rules['form-action'], ["'none'"]);
    for (const [name, values] of Object.entries(rules)) {
      assert.ok(!values.some((v) => /^https?:|\*/.test(v) || v === "'unsafe-eval'"), `${name} allows ${values}`);
      if (name !== 'style-src-attr') assert.ok(!values.includes("'unsafe-inline'"), `${name} allows inline code`);
    }
  });

  test('names every script and style sheet by a path of its own', () => {
    const doc = pageOf(html());
    const loaded = [...doc.querySelectorAll('script[src], link[rel=stylesheet]')].map(
      (el) => el.getAttribute('src') ?? el.getAttribute('href'),
    );
    assert.deepEqual(loaded, ['site.css', 'demo/harness.css', 'demo/styles.css', 'demo/icons.css', 'demo/demo.js']);
  });

  test('the home page links to it, and the sitemap and llms.txt list it', () => {
    const files = made();
    assert.ok([...pageOf(files['index.html']).querySelectorAll('.hero a')].some((a) => a.href === 'demo.html'));
    assert.match(files['sitemap.xml'], /<loc>https:\/\/thoughtknot\.app\/demo\.html<\/loc>/);
    assert.match(files['llms.txt'], /\[Live demo\]\(https:\/\/thoughtknot\.app\/demo\.html\)/);
  });
});

describe('the demo in a browser', () => {
  let chrome, why;
  try {
    chrome = findChrome(process.env.THOUGHTKNOT_CHROME);
  } catch {
    why = 'no Chrome found here (set THOUGHTKNOT_CHROME): the demo is checked in CI';
    if (process.env.GITHUB_ACTIONS) throw new Error('CI must check the demo, and found no Chrome');
    console.warn(why);
  }
  const options = { skip: why ?? false, timeout: 180_000 };
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
  let out, server, browser, origin;
  const outside = [];
  const run = async (js) => JSON.parse(await browser.run(`Promise.resolve(${js}).then(JSON.stringify)`));
  const until = async (js, what) => {
    for (let i = 0; i < 600; i++) {
      if (await run(js)) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(
      `the demo never ${what}: ${await run('document.getElementById("note")?.textContent.slice(0, 300)')}`,
    );
  };

  before(async () => {
    if (why) return;
    out = mkdtempSync(join(tmpdir(), 'site-demo-'));
    const files = made();
    const served = new Map([['/demo.html', files['demo.html']]]);
    for (const f of ['site.css', 'icon.svg']) served.set(`/${f}`, readFileSync(path(`site/${f}`)));
    await buildDemo(join(out, 'demo'));
    const walk = (dir, at) =>
      readdirSync(join(out, dir), { withFileTypes: true }).forEach((e) =>
        e.isDirectory()
          ? walk(join(dir, e.name), `${at}${e.name}/`)
          : served.set(`/${at}${e.name}`, readFileSync(join(out, dir, e.name))),
      );
    walk('demo', 'demo/');
    // only the built files are served, so no path a request names reaches the file system
    server = createServer((req, res) => {
      const name = new URL(req.url, 'http://x').pathname;
      const body = served.get(name);
      if (body === undefined) return res.writeHead(404).end();
      res.writeHead(200, { 'content-type': TYPES[extname(name)] ?? 'application/octet-stream' }).end(body);
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await startChrome({ chrome, width: 1400, height: 1000, scale: 1 });
    await browser.send('Network.enable');
    browser.on('Network.requestWillBeSent', ({ request }) => {
      if (!/^(data|blob):/.test(request.url) && !request.url.startsWith(origin)) outside.push(request.url);
    });
    // every policy the page breaks is kept, from before its first script runs
    await browser.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.broken = []; addEventListener('securitypolicyviolation', (e) => broken.push(e.violatedDirective + ' ' + e.blockedURI));`,
    });
    await browser.send('Page.navigate', { url: `${origin}/demo.html` });
    await until('document.body?.dataset.ready === "yes"', 'said it was ready');
  });

  after(async () => {
    await browser?.stop();
    server?.close();
    if (out) rmSync(out, { recursive: true, force: true });
  });

  test('draws every graph, and opens the first in the edit pane', options, async () => {
    await until(
      `document.querySelectorAll('#note .block-language-gql svg').length >= ${GRAPHS.length}`,
      'drew every graph',
    );
    const headings = await run(`[...document.querySelectorAll('#note h2')].map((h) => h.textContent)`);
    assert.deepEqual(
      headings,
      GRAPHS.map((g) => g.heading),
    );
    assert.equal(await run(`document.querySelectorAll('#note .block-language-gql').length`), GRAPHS.length);
    await until(`!!document.querySelector('#pane textarea, #pane [contenteditable="true"]')`, 'opened the pane');
    assert.ok(await run(`document.querySelector('#pane').textContent.includes('project_architecture')`));
  });

  test('an edit in the pane redraws its card, and stays in the page', options, async () => {
    const typed = await run(`(() => {
      const box = document.querySelector('#pane textarea');
      if (!box) return false;
      box.value = box.value.replace("name: 'Plug-ins'", "name: 'Add-ons'");
      box.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    assert.ok(typed, 'the pane has a text box');
    await until(
      `document.querySelector('#note .block-language-gql')?.textContent.includes('Add-ons')`,
      'redrew the edited card',
    );
  });

  test('draws its icons as pictures, not their names', options, async () => {
    const named = await run(`[...document.querySelectorAll('#note [data-icon]')].filter((el) =>
      !el.querySelector(':scope > .demo-icon')).length`);
    assert.equal(named, 0);
    assert.ok(await run(`document.querySelectorAll('#note .demo-icon').length > 5`));
  });

  test('sends no request outside the page, and breaks none of its policy', options, async () => {
    assert.deepEqual(outside, []);
    assert.deepEqual(await run('window.broken'), []);
  });
});
