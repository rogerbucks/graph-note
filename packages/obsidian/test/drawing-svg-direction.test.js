// A drawing that runs across is read right to left when Obsidian is in a right-to-left language (editor spec §42,
// rtl_drawing_direction): the first thing on the right, the last on the left, its words as written. The built plugin,
// loaded against the stand-ins for the page, laying out with the real engine.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
const TRIP = `// graph: trip
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Cafe {name: 'Cafe'}),
(home)-[:NEAR]->(park), (park)-[:NEAR]->(cafe)`;
const ACROSS = `// graph: trip_style · STYLE trip
(across:Nudge {word: 'direction', direction: 'LR'})`;
const NOTE = ['# Trip', '', fence(TRIP), '', fence(ACROSS), ''].join('\n');

/** Where each thing's box starts across the drawing, by its key. */
const lefts = (el) =>
  Object.fromEntries(
    el
      .querySelectorAll('g.node[data-key]')
      .map((g) => [
        g.getAttribute('data-key'),
        Number(/^M(-?[\d.]+)/.exec(g.querySelector('path').getAttribute('d'))[1]),
      ]),
  );

async function drawnIn(language) {
  const env = await load({ files: { [PATH]: NOTE }, language });
  const { el } = await show(env, NOTE);
  return { env, el, svg: el.querySelector('svg') };
}

describe('a drawing in Obsidian’s language', () => {
  // proves: rtl_drawing_direction
  test('in Arabic, a drawing that runs across starts on the right; in English, on the left as laid out', async () => {
    for (const [language, mirrored] of [
      ['ar', true],
      ['en', false],
    ]) {
      const { env, el, svg } = await drawnIn(language);
      try {
        assert.equal(svg.classList.contains('thoughtknot-mirrored'), mirrored, language);
        const x = lefts(el);
        assert.equal(x.home > x.park && x.park > x.cafe, mirrored, `${language}: ${JSON.stringify(x)}`);
        assert.ok(svg.textContent.includes('The park'), 'its words as written');
      } finally {
        env.uninstall();
      }
    }
  });
});
