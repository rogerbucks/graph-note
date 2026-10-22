// Every host's real adapter passes the one host contract (editor spec §43, hosts_pass_contract). Each runs as follows:
// - Obsidian's: built as the plugin builds it, run against the stand-in for Obsidian;
// - the browser page's: run in a DOM;
// - the desktop app's: the window carries the browser page's adapter unchanged, so it runs in the app's own built
//   editor page (packages/app).
// VS Code's joins this list when it is built.
import { test, describe, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { hostContract } from '../packages/core/src/display/host-contract.ts';
import { browserHost } from '../packages/claude-code/page/browser-host.ts';
import { fakeObsidian } from '../packages/obsidian/test/host/fake-obsidian.js';
import { builtApp, cleanUpApp } from '../packages/app/test/app-window.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);

/** A row of a menu as the contract reads it, from a title and its marks. */
const row = (title, checked, warning) => ({
  title,
  ...(checked !== undefined && { checked }),
  ...(warning && { warning: true }),
});

/** Obsidian's adapter as the plugin bundles it, with the core's host module beside it, loaded against `obsidian`. */
async function obsidianAdapter(obsidian) {
  const out = await build({
    stdin: {
      contents:
        "export { installObsidianHost } from './packages/obsidian/src/display-host.ts';\n" +
        "export { displayHost } from './packages/core/src/display/host.ts';\n",
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    external: ['obsidian'],
    write: false,
    logLevel: 'silent',
  });
  const Module = require('node:module');
  const m = new Module('obsidian-adapter.js');
  const real = Module._load;
  Module._load = (req, ...rest) => (req === 'obsidian' ? obsidian : real(req, ...rest));
  try {
    m._compile(out.outputFiles[0].text, 'obsidian-adapter.js');
  } finally {
    Module._load = real;
  }
  return m.exports;
}

/** A fresh Obsidian host for one check, and its probe over the stand-in's notices and menus. */
async function makeObsidian() {
  const state = {};
  const adapter = await obsidianAdapter(fakeObsidian(state));
  adapter.installObsidianHost();
  const doc = new JSDOM('<!doctype html><body></body>').window.document;
  const last = () => state.menus[state.menus.length - 1];
  return {
    host: adapter.displayHost(),
    probe: {
      doc,
      element: () => doc.body.appendChild(doc.createElement('span')),
      notices: () => state.notices,
      lastMenu: () =>
        last()?.rows.map((r) =>
          r === 'separator' ? r : row(r.title, r.checkable ? r.checked : undefined, r.warning),
        ) ?? null,
      choose: (title) =>
        last()
          .items.find((i) => i.title === title)
          .click(),
    },
  };
}

/** A fresh browser page host for one check, in its own DOM (`html`), and its probe over the page's notices and menus. */
function makeBrowser(html = '<!doctype html><body></body>') {
  const { window } = new JSDOM(html);
  const doc = window.document;
  const win = { document: doc, setTimeout: () => 0, matchMedia: () => ({ matches: false }) };
  const menus = () => [...doc.querySelectorAll('.gn-menu')];
  return {
    host: browserHost(win),
    probe: {
      doc,
      element: () => doc.body.appendChild(doc.createElement('span')),
      notices: () => [...doc.querySelectorAll('.gn-notice')].map((n) => n.textContent),
      lastMenu: () => {
        const menu = menus().pop();
        if (!menu) return null;
        return [...menu.children].map((el) =>
          el.tagName === 'HR'
            ? 'separator'
            : row(
                el.querySelector(':scope > span:last-child').textContent,
                el.hasAttribute('aria-checked') ? el.getAttribute('aria-checked') === 'true' : undefined,
                el.classList.contains('gn-menu-warning'),
              ),
        );
      },
      choose: (title) =>
        [...menus().pop().querySelectorAll('button')]
          .find((b) => b.querySelector(':scope > span:last-child').textContent === title)
          .click(),
    },
  };
}

/** A fresh desktop app host for one check: the browser page's adapter, in the app's built editor page, scripts left out. */
async function makeApp() {
  const page = readFileSync(join(await builtApp(), 'editor.html'), 'utf8').replace(/<script\b[\s\S]*?<\/script>/g, '');
  return makeBrowser(page);
}

/** The host the next check runs on: the checks ask for one synchronously, so each test makes it first. */
let made;

describe('every host’s adapter passes the one host contract', () => {
  after(cleanUpApp);
  for (const [name, make] of [
    ['Obsidian', makeObsidian],
    ['the browser page', () => makeBrowser()],
    ['the desktop app', makeApp],
  ])
    describe(name, () => {
      for (const check of hostContract(() => made))
        test(check.name, async () => {
          made = await make();
          await check.run();
        });
    });
});
