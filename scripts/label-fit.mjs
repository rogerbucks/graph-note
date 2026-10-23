// Right-to-left labels fit their boxes, as laid out in a real browser (editor spec §42, bidi_labels). A note names its
// things in Arabic, Hebrew, and both mixed with English and numbers. The Claude Code host's page draws it in a headless
// Chrome (chrome.mjs). Each thing's words are measured there against its box. Run by test/label-fit.test.js.
import { startChrome } from './chrome.mjs';
import { openPage } from './targets-reflow.mjs';

/** The names the note gives its things: right to left, and mixed with left-to-right words and numbers. */
export const RTL_NAMES = ['مرحبا بالعالم', 'שלום עולם גדול', 'Start מתחיל here', 'مشروع 2026 الأول', 'ABC שלום 123'];

/** A note with one graph, its things named `names`, each linked to the next. */
export function rtlNote(names = RTL_NAMES) {
  const things = names.map((name, i) => `(t${i}:Step {name: '${name}'})`);
  const links = names.slice(1).map((_, i) => `(t${i})-[:THEN]->(t${i + 1})`);
  return `# Names\n\`\`\`gql\n// graph: names\n${[...things, ...links].join(',\n')}\n\`\`\`\n`;
}

/** Run in the page. Each thing drawn: its name, its box, and the box of each of its lines of words. */
export const MEASURE = `[...document.querySelectorAll('.thoughtknot-svg g.node')].map((g) => {
  const box = (b) => ({ left: b.x, right: b.x + b.width, top: b.y, bottom: b.y + b.height });
  return {
    name: g.getAttribute('aria-label'),
    box: box(g.querySelector('path, polygon, ellipse, rect').getBBox()),
    words: [...g.querySelectorAll('text')].map((t) => ({ text: t.textContent, ...box(t.getBBox()) })),
  };
})`;

/** How far, in the drawing's units, words may pass their box before it counts: rounding, and a letter's overhang. */
const SLACK = 1;

/** What is wrong with the things as measured: each a sentence naming the thing and the words that do not fit. */
export function findings(measured) {
  const found = [];
  if (!measured.length) found.push('no thing was drawn');
  for (const { name, box, words } of measured)
    for (const w of words)
      if (
        w.left < box.left - SLACK ||
        w.right > box.right + SLACK ||
        w.top < box.top - SLACK ||
        w.bottom > box.bottom + SLACK
      )
        found.push(`${name}: "${w.text}" runs past its box`);
  return found;
}

/** The page at `link`, opened in Chrome, its drawing measured after `steps` and judged. */
export async function checkLabels(link, { chrome, steps = [] } = {}) {
  const browser = await startChrome({ chrome, width: 1400, scale: 1 });
  try {
    await openPage(browser, link);
    for (const step of steps) await browser.run(step);
    return findings(await browser.run(MEASURE));
  } finally {
    await browser.stop();
  }
}
