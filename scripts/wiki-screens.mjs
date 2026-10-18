#!/usr/bin/env node
// Takes the user guide's screenshots (spec §41, user_guide_wiki) from the current build. They show the plugin drawing
// the harness's sample note (packages/obsidian/harness) in a headless Chrome. Chrome is driven over the DevTools
// protocol with Node's own WebSocket, so no browser library is installed. The harness draws icons as their names. Each
// is swapped here for the same icon the browser editor's page ships (packages/claude-code/page/icons). So a picture
// looks as the plugin does. Each shot is one state of the page, cut to the part a reader needs to see. SHOTS is the
// one list of them, and the guide's pictures must match it (scripts/wiki.mjs, test/wiki.test.js).
//
// Usage:
//   node scripts/wiki-screens.mjs --out DIR [--chrome PATH]
//
// DIR gets one PNG for each shot, and labels.json: the name of every button the card shows. The wiki holds these
// against the guide, so a new control is never left unexplained.
import { execFileSync } from 'node:child_process';
import { findChrome, run, startChrome } from './chrome.mjs';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = join(ROOT, 'packages/claude-code/page/icons');

export { findChrome };

// the first card of the sample note: the graph "reader" with its question and three options
const CARD = '#note .block-language-gql';
const click = (label) => `document.querySelector('${CARD} [aria-label="${label}"]').click()`;

/**
 * Every screenshot of the guide. Each has its file name, what it shows (its alt text), and the part of the page it is
 * cut to. It also has the steps that bring the page to that state, each a line of script run in the page.
 */
export const SHOTS = [
  { name: 'card', alt: 'A graph drawn in a note, with its toolbar above it', steps: [], clip: CARD },
  {
    name: 'diagram-types',
    alt: 'The list of diagram types: network, tree, flow, radial, lanes, timeline and table',
    steps: [click('Diagram type')],
    clip: CARD,
  },
  { name: 'find', alt: 'Finding a thing by typing part of its name', steps: [click('Find a thing')], clip: CARD },
  {
    name: 'filter',
    alt: 'Showing only some kinds of thing and link',
    steps: [click('Filter by kind or link')],
    clip: CARD,
  },
  { name: 'edit-here', alt: 'Editing the graph in place, below its drawing', steps: [click('Edit here')], clip: CARD },
  {
    name: 'edit-in-pane',
    alt: 'The graph open in a pane beside the note, showing a problem and how to fix it',
    steps: [],
    clip: '#pane',
  },
  {
    name: 'export',
    alt: 'The export form: what to export, the format and the theme',
    steps: [click('Export')],
    clip: CARD,
  },
];

/** The value of a flag, or undefined. */
const flag = (args, name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};

/**
 * The files the page may ask for, by the path it asks with: each file of the built harness, and each icon under
 * /icons/. Only these are served, so no path a request names ever reaches the file system.
 */
export function servedFiles(dir, icons = ICONS) {
  const files = new Map([['/', join(dir, 'index.html')]]);
  for (const f of readdirSync(dir)) files.set(`/${f}`, join(dir, f));
  for (const f of readdirSync(icons)) files.set(`/icons/${f}`, join(icons, f));
  return files;
}

/** Serves the built harness, and the icons under /icons/, on a free port of this machine only. */
export function serve(dir) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
  const files = servedFiles(dir);
  const server = createServer((req, res) => {
    const file = files.get(new URL(req.url, 'http://x').pathname);
    if (!file) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

// the harness's icon names, each swapped for its picture; a name with no picture stays as it was
const ICONS_IN = `Promise.all([...document.querySelectorAll('[data-icon] > .harness-icon')].map(async (span) => {
  const r = await fetch('/icons/' + span.parentElement.dataset.icon + '.svg');
  if (!r.ok) return;
  span.innerHTML = await r.text();
  span.querySelector('svg')?.setAttribute('width', '16');
  span.querySelector('svg')?.setAttribute('height', '16');
}))`;

/** Opens the harness afresh and waits until it says it is ready, and the drawing has settled. */
export async function open(send, url) {
  await send('Page.navigate', { url });
  for (let i = 0; i < 150; i++) {
    if ((await run(send, 'document.body?.dataset.ready ?? ""')) === 'yes') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await new Promise((r) => setTimeout(r, 800));
  await run(send, ICONS_IN);
}

/** Takes every shot into out, and writes labels.json. */
export async function takeShots(out, { chrome } = {}) {
  mkdirSync(out, { recursive: true });
  const built = mkdtempSync(join(tmpdir(), 'wiki-harness-'));
  execFileSync(process.execPath, [join(ROOT, 'packages/obsidian/harness/build.mjs'), built], { stdio: 'inherit' });
  const server = await serve(built);
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await startChrome({ chrome });
  const { send } = browser;
  try {
    for (const shot of SHOTS) {
      await open(send, url);
      for (const step of shot.steps) {
        await run(send, step);
        await new Promise((r) => setTimeout(r, 400));
      }
      await run(send, ICONS_IN);
      const box = await run(
        send,
        `(() => { const el = document.querySelector('${shot.clip}'), r = el.getBoundingClientRect();
          const bottom = Math.max(...[...el.children].map((c) => c.getBoundingClientRect().bottom), r.top) + 16;
          return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: Math.min(r.height, bottom - r.top, 1600) }; })()`,
      );
      const png = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: { ...box, scale: 1 },
      });
      writeFileSync(join(out, `${shot.name}.png`), Buffer.from(png.data, 'base64'));
    }
    await open(send, url);
    const labels = await run(
      send,
      `[...new Set([...document.querySelectorAll('${CARD} button[aria-label]')].map((b) => b.getAttribute('aria-label')))]`,
    );
    writeFileSync(join(out, 'labels.json'), JSON.stringify(labels, null, 2) + '\n');
  } finally {
    await browser.stop();
    server.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const out = flag(args, '--out');
  if (!out) throw new Error('give the folder for the pictures: --out DIR');
  await takeShots(out, { chrome: flag(args, '--chrome') });
}
