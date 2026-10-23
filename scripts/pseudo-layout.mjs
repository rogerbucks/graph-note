// The test languages, laid out in a real browser (editor spec §42, pseudo_locales_checked). Each view of a host is
// opened in a headless Chrome (chrome.mjs) set to a test language. `en-XA` has every word accented and 40 per cent
// longer; `ar-XB` is the same, read right to left. Both hosts take their language from the browser. Then the words on
// the page are measured there:
// - words cut off by a box that hides what does not fit;
// - words drawn over other words in the same layer of the page.
// A menu, a tooltip or a sheet is a layer of its own, set over the page on purpose. So it may cover the page's words.
// The drawing is left out: its labels are placed by the layout (bidi_labels). Run by test/pseudo-layout.test.js; the
// jsdom checks of the same languages (test/pseudo-locales.test.js) cover what needs no layout.
import { pseudoWords } from '../packages/core/src/pseudo-words.ts';
import { SOURCE_WORDS } from '../packages/core/src/source-words.ts';
import { startChrome } from './chrome.mjs';
import { PAGE_VIEWS, jsText, openPage } from './targets-reflow.mjs';
import { SHOTS, open, serve } from './wiki-screens.mjs';

/** The test languages as Chrome names them: the browser says this language, and the hosts follow it. */
export const TEST_LANGUAGES = ['en-XA', 'ar-XB'];

/** The width each view is laid out at, a desktop's, in CSS pixels. */
export const WIDE = 1400;

/**
 * Run in the page. Gives the browser's language, the page's direction, and each run of words shown on it. Each run has
 * its first letters and its boxes on the screen. It has the box that clips it, if one does, and its layer. A layer
 * is the nearest box set apart from the flow (fixed, absolute or a popover), or the page itself.
 */
export const MEASURE = `(() => {
  const runs = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const layers = new Map();
  const layerOf = (el) => {
    for (let up = el; up && up !== document.body; up = up.parentElement) {
      const p = getComputedStyle(up).position;
      if (p === 'fixed' || p === 'absolute' || p === 'sticky' || up.matches('[popover], dialog')) {
        if (!layers.has(up)) layers.set(up, layers.size + 1);
        return layers.get(up);
      }
    }
    return 0;
  };
  const box = (r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.replace(/\\s+/g, ' ').trim();
    const el = node.parentElement;
    if (!text || !/\\p{L}/u.test(text) || !el) continue;
    if (el.closest('svg, script, style, textarea, .cm-editor, [aria-hidden="true"], [hidden]')) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1).map(box);
    if (!rects.length || rects.every((r) => r.right < 0 || r.bottom < 0)) continue;
    let clip = null;
    for (let up = el; up && up !== document.body; up = up.parentElement) {
      const s = getComputedStyle(up);
      if (s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowY === 'auto' || s.overflowY === 'scroll') break;
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
        clip = box(up.getBoundingClientRect());
        break;
      }
    }
    // a box a pixel or two across holds words for a screen reader only, hidden on purpose
    if (clip && (clip.right - clip.left <= 2 || clip.bottom - clip.top <= 2)) continue;
    runs.push({ text: text.slice(0, 40), rects, clip, layer: layerOf(el), cut: style.textOverflow === 'ellipsis' });
  }
  return { language: navigator.language, direction: getComputedStyle(document.body).direction, runs };
})()`;

/** How far, in CSS pixels, a box may pass another before it counts: rounding, and a letter's overhang. */
const SLACK = 2;

const crosses = (a, b) =>
  Math.min(a.right, b.right) - Math.max(a.left, b.left) > SLACK &&
  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > SLACK;

const outside = (r, c) =>
  r.left < c.left - SLACK || r.right > c.right + SLACK || r.top < c.top - SLACK || r.bottom > c.bottom + SLACK;

/**
 * What is wrong with a view as measured in a test language, each a sentence naming the view and the language. Words
 * cut short with an ellipsis on purpose still count as cut: a longer language must fit.
 */
export function findings(view, language, measured) {
  const found = [];
  if (measured.language !== language)
    found.push(`${view}, ${language}: the browser said ${measured.language}, so the view was not in the language`);
  const runs = measured.runs;
  for (const r of runs)
    if (r.clip && r.rects.some((box) => outside(box, r.clip)))
      found.push(`${view}, ${language}: "${r.text}" is cut off by its box`);
  for (let i = 0; i < runs.length; i++)
    for (let j = i + 1; j < runs.length; j++) {
      const [a, b] = [runs[i], runs[j]];
      if (a.layer === b.layer && a.rects.some((x) => b.rects.some((y) => crosses(x, y))))
        found.push(`${view}, ${language}: "${a.text}" and "${b.text}" are drawn over each other`);
    }
  return found;
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A view's step as it runs in `language`. A step finds a control by its aria-label or its text, in UK English. Here
 * each such name is the test language's words for it, as the page then shows them.
 */
export function inLanguage(step, language) {
  const words = pseudoWords(SOURCE_WORDS, language);
  const said = new Map(
    Object.entries(SOURCE_WORDS)
      .filter(([key, text]) => typeof text === 'string' && typeof words[key] === 'string')
      .map(([key, text]) => [text, words[key]]),
  );
  return step
    .replace(/aria-label="([^"]+)"/g, (whole, text) => (said.has(text) ? `aria-label="${said.get(text)}"` : whole))
    .replace(/"((?:[^"\\]|\\.)*)"/g, (whole, text) => {
      const plain = JSON.parse(`"${text}"`);
      return said.has(plain) ? jsText(said.get(plain)) : whole;
    });
}

/** Each view opened afresh by `open` in each test language, brought to its state by its steps, measured and judged. */
async function checkViews(views, { chrome, open: openView, languages = TEST_LANGUAGES }) {
  const found = [];
  for (const language of languages) {
    const browser = await startChrome({ chrome, width: WIDE, scale: 1 });
    try {
      // the language the browser says, to the page and to its formatters, as a person's browser set to it would
      const userAgent = await browser.run('navigator.userAgent');
      await browser.send('Emulation.setUserAgentOverride', { userAgent, acceptLanguage: language });
      await browser.send('Emulation.setLocaleOverride', { locale: language });
      for (const view of views) {
        await openView(browser);
        for (const step of view.steps) {
          await browser.run(inLanguage(step, language));
          await pause(400);
        }
        found.push(...findings(view.name, language, await browser.run(MEASURE)));
      }
    } finally {
      await browser.stop();
    }
  }
  return found;
}

/** The Obsidian host: the harness built into `built`, served here, each view one of the user guide's states. */
export async function checkHarness(built, { chrome, views = SHOTS, languages } = {}) {
  const server = await serve(built);
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  try {
    return await checkViews(views, { chrome, languages, open: (browser) => open(browser.send, url) });
  } finally {
    server.close();
  }
}

/** The Claude Code host: its page at `link`, served by a running editor server, in each of its views. */
export function checkEditorPage(link, { chrome, views = PAGE_VIEWS, languages } = {}) {
  return checkViews(views, { chrome, languages, open: (browser) => openPage(browser, link) });
}
