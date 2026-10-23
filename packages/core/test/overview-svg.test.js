// The overview of a graph too large to draw, as one SVG picture (editor spec §53, scale_massive_card): overview-svg.ts.
// - Each group is a box with its name and count, and lines join the groups that link.
// - It says what it is and why at its top, and every word is escaped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overviewOf } from '../src/overview.ts';
import { overviewSvg } from '../src/overview-svg.ts';
import { PALETTES } from '../src/palette.ts';

const keys = (name, n) => Array.from({ length: n }, (_, i) => `${name}${i}`);
const GROUPING = {
  by: 'kind',
  groups: [
    { id: 'group:a', label: 'People & <pets>', by: 'kind', keys: keys('a', 30) },
    { id: 'group:b', label: 'Places', by: 'kind', keys: keys('b', 10) },
  ],
  between: [{ from: 0, to: 1, links: 4 }],
};
const CAPTION = ['Overview of Big: 40 things in 2 groups.', 'Too large to draw.'];

test('each group is a box named with its count, and the groups that link are joined by a line', () => {
  const svg = overviewSvg(overviewOf(GROUPING), PALETTES.light, CAPTION);
  assert.equal((svg.match(/<rect [^>]*stroke=/g) ?? []).length, 2, 'a box a group');
  assert.match(svg, /<title>People &amp; &lt;pets&gt;, 30 things<\/title>/);
  assert.match(svg, />Places<\/text>/);
  assert.match(svg, />10 things<\/text>/);
  assert.equal((svg.match(/<line /g) ?? []).length, 1);
  assert.doesNotMatch(svg, /<pets>/, 'every word is escaped');
});

test('it says what it is and why at its top, and that is its title for a screen reader', () => {
  const svg = overviewSvg(overviewOf(GROUPING), PALETTES.light, CAPTION);
  assert.match(svg, /^<svg [^>]*role="img"/);
  assert.match(svg, /<title>Overview of Big: 40 things in 2 groups\. Too large to draw\.<\/title>/);
  const lines = [...svg.matchAll(/<text x="0" y="(-?[\d.]+)"[^>]*>([^<]*)<\/text>/g)];
  assert.deepEqual(
    lines.map((l) => l[2]),
    CAPTION,
  );
  assert.ok(
    lines.every((l) => Number(l[1]) < 0),
    'above the boxes',
  );
});

test('in a palette that follows the system, it carries its own sheet and paints its page', () => {
  const svg = overviewSvg(overviewOf(GROUPING), PALETTES.system, CAPTION);
  assert.match(svg, /<style>[^<]*@media \(prefers-color-scheme: dark\)/);
  assert.match(svg, /background:var\(--gn-page\)/);
  assert.match(svg, /fill="var\(--gn-fill-cyan\)"/);
});
