// Pointer targets and reflow, measured in a real browser (editor spec §41, a11y_targets_reflow_auto; WCAG 2.2 SC 2.5.8
// and 1.4.10). Each view of a host is opened in a headless Chrome (chrome.mjs), as wide as a desktop and 320 CSS
// pixels wide. Every control the page holds is measured there, and what was measured is judged. Run by
// test/a11y-targets-reflow.test.js; the Obsidian host's views are the user guide's own states (wiki-screens.mjs).
import { startChrome } from './chrome.mjs';
import { SHOTS, open, serve } from './wiki-screens.mjs';

/** The least a pointer target may measure each way, in CSS pixels (SC 2.5.8). */
export const MIN_TARGET = 24;
/** The width every view must reflow at, in CSS pixels (SC 1.4.10). */
export const NARROW = 320;
/** The width a view is first measured at, a desktop's. */
export const WIDE = 1400;

/**
 * Run in the page. Gives its width, how wide its content is, and every shown control a pointer can take. Each control
 * is named by its tag and its accessible name or text, numbered when the name repeats. Some controls are marked so:
 * - one in the drawing (two-dimensional content);
 * - a link inside a sentence (inline);
 * - one in a box of its own that scrolls sideways.
 * A control of a pixel or less is only for a screen reader, and left out.
 */
export const MEASURE = `(() => {
  const selector = 'button, a[href], input, select, textarea, summary, [role=button], [role=link], [role=menuitem], ' +
    '[role=tab], [role=option], [role=checkbox], [role=radio], [role=switch], [tabindex]:not([tabindex="-1"])';
  const seen = new Map();
  const controls = [];
  for (const el of document.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (r.width <= 1 || r.height <= 1 || style.visibility === 'hidden') continue;
    const said = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\\s+/g, ' ').slice(0, 40);
    const base = el.tagName.toLowerCase() + ' ' + said;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const block = el.tagName === 'A' && el.closest('p, li');
    let scrolls = false;
    for (let up = el.parentElement; up && up !== document.documentElement; up = up.parentElement) {
      const x = getComputedStyle(up).overflowX;
      if ((x === 'auto' || x === 'scroll') && up.scrollWidth > up.clientWidth) scrolls = true;
    }
    controls.push({
      name: n === 1 ? base : base + ' (' + n + ')',
      width: r.width, height: r.height, left: r.left, right: r.right,
      drawing: Boolean(el.closest('svg')),
      inline: Boolean(block && block.textContent.trim().length > el.textContent.trim().length),
      scrolls,
    });
  }
  return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, controls };
})()`;

const px = (n) => Math.round(n);

const reach = (c, width) => c.scrolls || (c.left >= -1 && c.right <= width + 1);

/**
 * What is wrong with a view, measured wide and narrow: each finding a sentence naming the view. `narrow` is one measure,
 * or one for each tab a phone's layout shows in the view's place (the edit pane's Drawing and Text). A control seen
 * wide must be on one of them. A control out of reach wide too, as a skip link is until focused, is placed so on purpose.
 */
export function findings(view, wide, narrow) {
  const tabs = [narrow].flat();
  const found = [];
  for (const [measured, at] of [[wide, 'wide'], ...tabs.map((t) => [t, 'narrow'])])
    for (const c of measured.controls)
      if (!c.drawing && !c.inline && (c.width < MIN_TARGET || c.height < MIN_TARGET))
        found.push(
          `${view}: ${c.name} is ${px(c.width)} by ${px(c.height)} CSS pixels, under ${MIN_TARGET} by ${MIN_TARGET} (${at})`,
        );
  for (const t of tabs)
    if (t.scrollWidth > t.width + 1)
      found.push(`${view}: at ${t.width} CSS pixels the page is ${px(t.scrollWidth)} wide, so it scrolls sideways`);
  const width = tabs[0].width;
  for (const w of wide.controls) {
    const seen = tabs.map((t) => t.controls.find((c) => c.name === w.name)).filter(Boolean);
    if (!seen.length) found.push(`${view}: at ${width} CSS pixels ${w.name} is gone`);
    else if (reach(w, wide.width) && !seen.some((c) => reach(c, width)))
      found.push(
        `${view}: at ${width} CSS pixels ${w.name} is out of reach, at ${px(seen[0].left)} to ${px(seen[0].right)}`,
      );
  }
  return found;
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Each view opened afresh by `open`, brought to its state by its steps, measured wide and narrow, and judged. */
async function checkViews(views, { chrome, open: openView }) {
  const browser = await startChrome({ chrome, width: WIDE, scale: 1 });
  const found = [];
  try {
    for (const view of views) {
      const measure = async (width, tab = []) => {
        await browser.resize(width);
        await openView(browser);
        for (const step of [...view.steps, ...tab]) {
          await browser.run(step);
          await pause(400);
        }
        return browser.run(MEASURE);
      };
      const wide = await measure(WIDE);
      const narrow = [];
      for (const tab of view.tabs ?? [[]]) narrow.push(await measure(NARROW, tab));
      found.push(...findings(view.name, wide, narrow));
    }
  } finally {
    await browser.stop();
  }
  return found;
}

/** The Obsidian host: the harness built into `built`, served here, each view one of the user guide's states. */
export async function checkHarness(built, { chrome, views = SHOTS } = {}) {
  const server = await serve(built);
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  try {
    return await checkViews(views, { chrome, open: (browser) => open(browser.send, url) });
  } finally {
    server.close();
  }
}

/**
 * A text as JavaScript for the page to run. JSON gives a quoted string. The characters that could end a script or a
 * line in a page are written as escapes too.
 */
export const jsText = (text) =>
  JSON.stringify(String(text)).replace(
    /[<>/\u2028\u2029]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );

const press = (label) =>
  `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${jsText(label)}).click()`;

const tab = (label) =>
  `[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent.trim() === ${jsText(label)}).click()`;

/**
 * The Claude Code host's views: the note opened, then each of the choosers under its graph opened. At a phone's width
 * the edit pane shows its Drawing and its Text as tabs, one at a time. So each view is measured narrow on each tab.
 */
const PHONE_TABS = [[tab('Text')], [tab('Drawing')]];
export const PAGE_VIEWS = [
  { name: 'page', steps: [], tabs: PHONE_TABS },
  { name: 'compare', steps: [press('Compare with…')], tabs: PHONE_TABS },
  { name: 'review', steps: [press('Review a change from GitHub…')], tabs: PHONE_TABS },
];

/** Opens the page at `link` and waits until it has drawn the note, and the drawing has settled. */
export async function openPage(browser, link) {
  // by way of a blank page: the same address again would only move to its fragment, and load nothing afresh
  await browser.send('Page.navigate', { url: 'about:blank' });
  await browser.send('Page.navigate', { url: link });
  for (let i = 0; i < 150; i++) {
    if (await browser.run(`Boolean(document.querySelector('.gn-changes') && document.querySelector('svg'))`)) break;
    await pause(100);
  }
  await pause(800);
}

/** The Claude Code host: its page at `link`, served by a running editor server, in each of its views. */
export function checkEditorPage(link, { chrome, views = PAGE_VIEWS } = {}) {
  return checkViews(views, { chrome, open: (browser) => openPage(browser, link) });
}
