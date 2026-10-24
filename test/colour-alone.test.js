// No meaning is carried by colour alone (editor spec §44, colour_never_alone; WCAG 1.4.1). Each meaning a colour
// carries is carried by a shape, a line, a word or a sign too. So a reader who cannot tell two colours apart loses
// nothing. These are the places a colour once stood alone. Others are checked where they are made: focus, suggested
// names, estimates, parked things, proposals and the changes view.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../packages/core/src/drawing.ts';
import { loadEngine } from '../packages/core/src/engine.ts';
import { exportSvg } from '../packages/core/src/export.ts';
import { exportScope } from '../packages/core/src/export-scope.ts';
import { legendOf, readStyle } from '../packages/core/src/style.ts';
import { build, load, until } from '../packages/obsidian/test/host/load-plugin.js';
import { fence } from '../packages/obsidian/test/host/notes.js';
import { READER, open, type } from '../packages/obsidian/test/host/pane-notes.js';
import { show } from '../packages/obsidian/test/host/view-notes.js';
import { rulesOf, valueOf } from './repository/sheet-rules.js';
import { pieces } from '../packages/core/test/text-find.js';

// a warning on its own line (a name not in the graph), then an error on its own (a value left out)
const WARNING_LINE = '(eyes)-[:FAVOURS]->(larg)';
const ERROR_LINE = '(x:T {y: })';

before(() => build());

/** The sign at the end of each line that has one, in order. */
const signs = (env) =>
  env.el.querySelectorAll('.thoughtknot-overlay .thoughtknot-line-sign').map((s) => s.textContent.trim());

/** The edit pane with `lines` typed after the reader graph, the caret at the end, once each line has its sign. */
async function typed(lines) {
  const env = await open();
  const text = [READER + ',', ...lines].join('\n');
  type(env.el, text, text.length);
  await until(() => signs(env).length === lines.length);
  return env;
}

/** The words of each row of the fix bar. */
const rows = (env) => env.el.querySelector('.thoughtknot-fixbar').children.map((r) => r.textContent);

describe('an error is told from a warning without its colour', () => {
  // proves: colour_never_alone
  test('by the sign at the end of its line: ✖ for an error, ⚠ for a warning', async () => {
    const env = await typed([WARNING_LINE + ',', ERROR_LINE]);
    try {
      assert.deepEqual(signs(env), ['⚠', '✖']);
    } finally {
      env.uninstall();
    }
  });

  // proves: colour_never_alone
  test('by the sign in the fix bar: ✖ for an error, ⚠ for a warning', async () => {
    for (const [line, sign] of [
      [WARNING_LINE, '⚠'],
      [ERROR_LINE, '✖'],
    ]) {
      const env = await typed([line]);
      try {
        assert.ok(rows(env).length, `a row for ${line}`);
        for (const row of rows(env)) assert.equal(row.slice(0, 2), `${sign} `, row);
      } finally {
        env.uninstall();
      }
    }
  });

  // proves: colour_never_alone
  test('by the line under its words: wavy for an error, dashed for a warning, dotted for a hint', () => {
    const rules = rulesOf('styles.css').filter((r) => !r.media);
    const style = (selector) =>
      rules
        .filter((r) => r.selectors.includes(selector))
        .map(
          (r) => valueOf(r, 'text-decoration-style') ?? valueOf(r, 'text-decoration')?.match(/wavy|dashed|dotted/)?.[0],
        )
        .findLast(Boolean);
    assert.equal(style('.thoughtknot-problem.is-error'), 'wavy');
    assert.equal(style('.thoughtknot-problem.is-warning'), 'dashed');
    assert.equal(style('.thoughtknot-problem.is-hint'), 'dotted');
  });
});

// A view whose looks give colours only: purple for the places near the park, orange for the lake
const TRIP = `// graph: trip
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Cafe {name: 'Cafe'}),
(lake:Place {name: 'The lake'}),
(home)-[:NEAR]->(park), (park)-[:NEAR]->(cafe), (cafe)-[:NEAR]->(lake)`;
const NEAR = "// graph: trip · QUERY view round_park\nMATCH (n {id: 'park'})-[]-{1,3}(m) RETURN n, m";
const LOOKS = `// graph: trip_style · STYLE trip
(a:Look {view: 'round_park', kind: 'Place', colour: 'purple', means: 'places'}),
(b:Look {view: 'round_park', thing: 'lake', colour: 'orange', means: 'by the water'})`;
const BLOCKS = [TRIP, NEAR, LOOKS];
const reading = readNote(BLOCKS);
const { style } = readStyle(BLOCKS, 'trip', reading);
const legend = legendOf(style, { view: 'round_park' });

describe('a look’s colour is told by a tag as well', () => {
  // proves: colour_never_alone
  test('each colour of a view’s legend has its own numbered tag, in the legend’s order', async () => {
    const { lookTags } = await import('../packages/core/src/look-tags.ts');
    assert.deepEqual(
      legend.map((e) => e.means),
      ['places', 'by the water'],
    );
    assert.deepEqual(
      [...lookTags(legend)],
      [
        ['purple', '①'],
        ['orange', '②'],
      ],
    );
    const many = Array.from({ length: 22 }, (_, i) => ({ colour: `c${i}`, means: `m${i}` }));
    assert.deepEqual([...lookTags(many).values()].slice(18), ['⑲', '⑳', '(21)', '(22)']);
  });

  // proves: colour_never_alone
  test('on the view’s card: each box a look colours carries its tag, and the legend gives it beside the meaning', async () => {
    const note = ['# Trip', '', ...BLOCKS.flatMap((b) => [fence(b), '']), ''].join('\n');
    const env = await load({ files: { 'Trip.md': note } });
    try {
      const { el } = await show(env, note, 1);
      const tagOf = (key) =>
        el
          .querySelectorAll('g.node')
          .find((g) => g.getAttribute('data-key') === key)
          ?.querySelector('.thoughtknot-look-tag')?.textContent;
      assert.equal(tagOf('park'), '①');
      assert.equal(tagOf('home'), '①');
      assert.equal(tagOf('lake'), '②', 'the thing’s own look, over its kind’s');
      assert.equal(tagOf('cafe'), undefined, 'no look, no tag');
      const rows = el.querySelectorAll('.thoughtknot-legend li').map((li) => li.textContent);
      assert.deepEqual(rows, ['① places', '② by the water']);
    } finally {
      env.uninstall();
    }
  });

  // proves: colour_never_alone
  test('in an export of the view: each coloured box carries its tag, and the legend gives it beside the meaning', async () => {
    const engine = await loadEngine();
    const scope = exportScope(reading, {
      graph: 'trip',
      view: { name: 'round_park', spec: { kind: 'near', id: 'park', depth: 3 } },
    });
    const { svg } = exportSvg(scope, engine, { note: 'Trip.md', date: '2026-10-20', theme: 'light', style });
    // the group of the box whose name is drawn as `name`
    const group = (name) =>
      pieces(svg, '<g id="node', '</g>')
        .filter((g) => /^<g id="node\d+"/.test(g))
        .find((g) => g.includes(`>${name}</text>`)) ?? '';
    assert.match(group('The park'), />①<\/text>/);
    assert.match(group('The lake'), />②<\/text>/);
    assert.doesNotMatch(group('Cafe'), /[①②]/);
    const said = [...svg.matchAll(/>([^<>]+)<\/(?:text|tspan)>/g)].map((m) => m[1]);
    assert.ok(said.includes('① places') && said.includes('② by the water'), said.join('|'));
  });
});
