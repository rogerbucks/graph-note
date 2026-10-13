// Exports carry title, legend and source (editor spec §16): an image of the whole diagram or of a view, as SVG or PNG, with
// its theme colours fixed so it reads the same outside Obsidian, drawn at no less than twice natural size, and saying on
// its face what it is, what its colours mean, and which note and day it came from. A view export holds only the view,
// unless the faded context is asked for. An image too large for one sharp PNG is split across pages (big_export). The
// data is exported as a GQL block, as CSV and as GraphML, and each reads back into the very things and links exported,
// however large the graph (export_data_formats, export_lossless).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import GraphLayout from '@graph-note/graph-spec/src/graph-layout.js';
import { loadEngine } from '../src/engine.ts';
import { readNote } from '../src/drawing.ts';
import { EXPORT_FORMATS, PNG_MIN_SCALE, exportSvg, exportWithLayout, pngSize } from '../src/export.ts';
import { DATA_FORMATS, dataText, exportedData } from '../src/export-data.ts';
import { pageSvg, pngPages } from '../src/export-pages.ts';
import { exportScope } from '../src/export-scope.ts';
import { FADED_OPACITY } from '../src/export-marks.ts';
import { STYLE } from '../src/layout.ts';
import { LAYOUT_LIMITS, PAGE_LIMITS } from '../src/layout-limits.ts';
import { dataOf, readBack } from './export-data-readers.js';
import { LayoutRunner, inThreadPort, serveLayouts } from '../src/layout-worker.ts';
import { PALETTES } from '../src/palette.ts';
import { readStyle } from '../src/style.ts';
import { hueColour } from '../src/theme.ts';

const TEAM = `// graph: team · SOURCE
(alice:Person {name: 'Alice'}),
(bob:Person {name: 'Bob'}),
(carol:Person {name: 'Carol'}),
(dan:Person {name: 'Dan'}),
(zoe:Person {name: 'Zoe'}),
(core:Team {name: 'Core'}),
(alice)-[:KNOWS]->(bob),
(bob)-[:KNOWS]->(carol),
(carol)-[:KNOWS]->(dan),
(alice)-[:MEMBER_OF]->(core),
(bob)-[:MEMBER_OF]->(core)`;
const STYLED = [
  TEAM,
  `// graph: team_style · STYLE team
(l1:Look {view: 'around_bob', thing: 'alice', colour: 'green', line: 'dashed', means: 'the owner'}),
(l2:Look {view: 'around_bob', kind: 'Team', colour: 'purple', means: 'where they sit'})`,
];

const engine = await loadEngine();
const reading = readNote(STYLED);
const { style, problems } = readStyle(STYLED, 'team', reading);
assert.deepEqual(problems, []);
const AROUND = { name: 'around_bob', spec: { kind: 'near', id: 'bob', depth: 1 } };
const INFO = { note: 'Trips/Team.md', date: '2026-10-11', theme: 'light', style };
const texts = (svg) => [...svg.matchAll(/>([^<>]+)<\/(?:text|tspan)>/g)].map((m) => m[1]);
const nodeGroups = (svg) => [...svg.matchAll(/<g id="node\d+" class="node"/g)].length;

describe('the formats and the size of a PNG', () => {
  // proves: export_formats
  test('images are offered as SVG and PNG', () => {
    assert.deepEqual([...EXPORT_FORMATS], ['svg', 'png']);
  });

  // proves: export_png_sharp
  test('a PNG is drawn at twice natural size at least, whatever scale is asked for', () => {
    assert.equal(PNG_MIN_SCALE, 2);
    assert.deepEqual(pngSize(300, 200), { scale: 2, width: 600, height: 400 });
    for (const asked of [0, 1, 1.5, -3, NaN, Infinity, undefined, null, '3']) {
      const s = pngSize(300, 200, asked);
      assert.ok(s.scale >= 2, String(asked));
      assert.ok(s.width >= 600 && s.height >= 400, String(asked));
    }
  });

  // proves: export_png_sharp
  test('a larger scale is kept, and the pixels are whole numbers that round up, never down', () => {
    assert.deepEqual(pngSize(300, 200, 3), { scale: 3, width: 900, height: 600 });
    assert.deepEqual(pngSize(301.2, 100.1, 2), { scale: 2, width: 603, height: 201 });
    assert.deepEqual(pngSize(338.6666, 217.3333), { scale: 2, width: 678, height: 435 });
  });

  // proves: export_png_sharp
  test('the size is worked out from the image the export gives', () => {
    const image = exportSvg(exportScope(reading, { graph: 'team' }), engine, INFO);
    const s = pngSize(image.width, image.height);
    assert.ok(s.width >= 2 * image.width && s.height >= 2 * image.height);
  });
});

describe('the image of the whole diagram', () => {
  const scope = exportScope(reading, { graph: 'team' });

  // proves: export_self_explaining
  test('carries its title, its legend and the note and day it came from', () => {
    const image = exportSvg(scope, engine, INFO);
    const said = texts(image.svg);
    assert.ok(said.includes('team'), 'the graph’s name is the title');
    assert.ok(said.includes('Person') && said.includes('Team'), 'the legend names the kinds');
    assert.ok(
      said.some((t) => t.includes('Trips/Team.md') && t.includes('11 Oct 2026')),
      said.join('|'),
    );
    assert.match(image.svg, /<title>team<\/title>/);
    for (const name of ['Alice', 'Bob', 'Carol', 'Dan', 'Zoe', 'Core']) assert.ok(said.includes(name), name);
  });

  // proves: export_self_explaining
  test('draws each kind’s swatch in the colour the drawing gives that kind', () => {
    const hues = GraphLayout.pick(['Person', 'Team'], STYLE.kind_hues, STYLE.kind_colours);
    const p = PALETTES.light;
    const swatches = [...exportSvg(scope, engine, INFO).svg.matchAll(/<rect class="legend-swatch"[^>]*>/g)];
    assert.equal(swatches.length, 2);
    assert.ok(swatches[0][0].includes(`fill="${hueColour(hues.Person, 'fill', p)}"`));
    assert.ok(swatches[0][0].includes(`stroke="${hueColour(hues.Person, 'line', p)}"`));
    assert.ok(swatches[1][0].includes(`fill="${hueColour(hues.Team, 'fill', p)}"`));
    // the same colour is on the boxes drawn
    assert.ok(exportSvg(scope, engine, INFO).svg.includes(hueColour(hues.Person, 'fill', p)));
  });

  // proves: export_fixed_theme
  test('has its theme colours fixed, light or dark as chosen: no variable and no blend is left in it', () => {
    for (const theme of ['light', 'dark']) {
      const { svg } = exportSvg(scope, engine, { ...INFO, theme });
      assert.doesNotMatch(svg, /var\(--/, theme);
      assert.doesNotMatch(svg, /color-mix\(/, theme);
      assert.doesNotMatch(svg, /currentColor|inherit/, theme);
      const page = PALETTES[theme].page;
      assert.match(svg, new RegExp(`<rect [^>]*fill="${page}"`), `${theme} has its own background`);
    }
  });

  // proves: export_fixed_theme
  test('the two themes differ in colour only: the same words, the same size', () => {
    const light = exportSvg(scope, engine, { ...INFO, theme: 'light' });
    const dark = exportSvg(scope, engine, { ...INFO, theme: 'dark' });
    assert.notEqual(light.svg, dark.svg);
    assert.deepEqual(texts(light.svg), texts(dark.svg));
    assert.deepEqual([light.width, light.height], [dark.width, dark.height]);
    assert.ok(light.svg.includes(PALETTES.light.text) && !light.svg.includes(PALETTES.dark.text));
    assert.ok(dark.svg.includes(PALETTES.dark.text) && !dark.svg.includes(PALETTES.light.text));
  });

  // proves: export_two_scopes
  test('is the same every time, and as large as the width and height it reports', () => {
    const a = exportSvg(scope, engine, INFO),
      b = exportSvg(scope, engine, INFO);
    assert.deepEqual(a, b);
    const root = /^<svg\b[^>]*>/.exec(a.svg)[0];
    assert.ok(root.includes(`width="${a.width}"`) && root.includes(`height="${a.height}"`));
    assert.ok(a.width >= 360 && a.height > 100);
    // balanced: every group and text opened is closed
    for (const tag of ['svg', 'g', 'text', 'tspan']) {
      const open = (a.svg.match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? []).length;
      assert.equal((a.svg.match(new RegExp(`</${tag}>`, 'g')) ?? []).length, open, tag);
    }
  });

  // proves: export_self_explaining
  test('works without a style graph: the locked style, and a legend of the kinds alone', () => {
    const { svg } = exportSvg(scope, engine, { note: 'Team.md', date: '2026-10-11', theme: 'light' });
    assert.equal((svg.match(/legend-swatch/g) ?? []).length, 2);
  });
});

describe('the image of a view', () => {
  const only = exportScope(reading, { graph: 'team', view: AROUND });
  const withContext = exportScope(reading, { graph: 'team', view: AROUND, context: true });

  // proves: view_export_stays_view
  test('holds only the things in the view', () => {
    const { svg } = exportSvg(only, engine, INFO);
    const said = texts(svg);
    for (const name of ['Alice', 'Bob', 'Carol', 'Core']) assert.ok(said.includes(name), name);
    for (const name of ['Dan', 'Zoe']) assert.ok(!said.includes(name), name);
    assert.equal(nodeGroups(svg), 4);
    assert.doesNotMatch(svg, new RegExp(`opacity:${FADED_OPACITY}`));
  });

  // proves: export_self_explaining
  test('is titled with the view’s name and says what the view is, in plain English', () => {
    const said = texts(exportSvg(only, engine, INFO).svg);
    assert.ok(
      said.some((t) => t.includes('around_bob') && t.includes('team')),
      said.join('|'),
    );
    assert.ok(said.includes('Everything within 1 step of Bob'), said.join('|'));
  });

  // proves: view_export_stays_view
  test('with the faded context asked for, holds the whole graph with what is outside the view faded, and says so', () => {
    const { svg } = exportSvg(withContext, engine, INFO);
    assert.equal(nodeGroups(svg), 6);
    const faded = [
      ...svg.matchAll(new RegExp(`<g id="(\\w+)" class="(?:node|edge)" style="opacity:${FADED_OPACITY}">`, 'g')),
    ];
    assert.equal(faded.length, withContext.faded.things.length + withContext.faded.links.length);
    // Dan (the fourth thing) and Zoe (the fifth) are the faded nodes, and the link from Carol to Dan the faded edge
    assert.deepEqual(faded.map((m) => m[1]).sort(), ['edge3', 'node4', 'node5']);
    assert.ok(
      texts(svg).some((t) => /faded/.test(t)),
      'the subtitle says the rest is faded',
    );
  });

  // proves: styled_paths_and_views
  test('draws the view’s looks, and puts each colour in the legend with what it means', () => {
    const p = PALETTES.light;
    const { svg } = exportSvg(only, engine, INFO);
    const said = texts(svg);
    assert.ok(said.includes('the owner') && said.includes('where they sit'));
    const swatches = [...svg.matchAll(/<rect class="legend-swatch"[^>]*>/g)].map((m) => m[0]);
    assert.equal(swatches.length, 4, 'two kinds and two looks');
    for (const hue of ['green', 'purple'])
      assert.ok(
        swatches.some((s) => s.includes(hueColour(hue, 'line', p))),
        hue,
      );
    // Alice (the first box) is drawn dashed in the green look
    const alice = /<g id="node1" class="node">[\s\S]*?<\/g>/.exec(svg)[0];
    assert.ok(alice.includes(`stroke:${hueColour('green', 'line', p)}`));
    assert.match(alice, /stroke-dasharray:6 4/);
  });

  // proves: styled_paths_and_views
  test('the whole diagram is in the locked style: a view’s looks are not drawn there, nor in its legend', () => {
    const { svg } = exportSvg(exportScope(reading, { graph: 'team' }), engine, INFO);
    assert.ok(!texts(svg).includes('the owner'));
    assert.doesNotMatch(svg, /stroke-dasharray/);
  });
});

describe('nothing to export, and an engine that fails', () => {
  // proves: empty_export
  test('an empty scope is refused, never drawn as a blank image', () => {
    const none = exportScope(reading, {
      graph: 'team',
      view: { name: 'robots', spec: { kind: 'kinds', kinds: ['Robot'] } },
    });
    assert.throws(() => exportSvg(none, engine, INFO), /nothing to export/);
  });

  // proves: failed_export
  test('when the engine cannot lay the drawing out, the failure is raised, not swallowed or drawn as a blank', () => {
    const broken = {
      version: '0',
      render() {
        throw new Error('out of memory');
      },
    };
    assert.throws(() => exportSvg(exportScope(reading, { graph: 'team' }), broken, INFO), /out of memory/);
  });
});

// layout_contained: an export is laid out where a drawing is, apart from the interface and under the same limits, so the
// host hands in the layout (its worker's runner), never an engine to run on the page's own thread
describe('laid out by the host’s layout, under its limits', () => {
  const CLOCK = { setTimeout: (run, ms) => setTimeout(run, ms), clearTimeout: (t) => clearTimeout(t) };
  const runner = (limits) =>
    new LayoutRunner({
      page: () => inThreadPort((s) => serveLayouts(s, async () => engine)),
      clock: CLOCK,
      ...(limits ? { pageLimits: () => ({ ...PAGE_LIMITS, ...limits }) } : {}),
    });
  const through = (r) => (drawing, theme) => r.draw(drawing, undefined, theme);
  const whole = exportScope(reading, { graph: 'team' });
  const VIEWS = [
    whole,
    exportScope(reading, { graph: 'team', view: AROUND }),
    exportScope(reading, { graph: 'team', view: AROUND, context: true }),
  ];

  // proves: layout_contained
  test('gives the very image exportSvg gives, whole diagram, view and view with its context, in either theme', async () => {
    const r = runner();
    for (const s of VIEWS)
      for (const theme of ['light', 'dark']) {
        const info = { ...INFO, theme };
        assert.deepEqual(await exportWithLayout(s, through(r), info), exportSvg(s, engine, info));
      }
    r.close();
  });

  // proves: layout_contained
  test('hands the layout the drawing with the style’s nudges, and the theme chosen', async () => {
    const asked = [];
    const nudged = { ...style, nudges: [{ word: 'beside', thing: 'alice', other: 'bob', at: {} }], direction: 'TB' };
    const spy = (d, theme) => (asked.push({ d, theme }), Promise.resolve(null));
    await exportWithLayout(whole, spy, { ...INFO, theme: 'dark', style: nudged });
    assert.equal(asked.length, 1);
    assert.equal(asked[0].theme, 'dark');
    assert.deepEqual(asked[0].d.nudges, nudged.nudges);
    assert.equal(asked[0].d.direction, 'TB', 'the style’s direction');
    assert.equal(asked[0].d.boxes.length, whole.drawing.boxes.length);
  });

  // proves: layout_contained, failed_export
  test('a graph over a limit is the limit’s refusal, handed back whole, and nothing is laid out', async () => {
    const r = runner({ things: 3 });
    const out = await exportWithLayout(whole, through(r), INFO);
    assert.deepEqual(out, { reason: 'too-large', limit: 'things', count: 6, most: 3, page: true });
    r.close();
  });

  // proves: layout_contained, failed_export
  test('a layout that is stopped is the refusal, one no longer wanted is null, and a failed engine is raised', async () => {
    const stopped = { reason: 'timed-out', ms: 5000 };
    assert.deepEqual(await exportWithLayout(whole, async () => stopped, INFO), stopped);
    assert.equal(await exportWithLayout(whole, async () => null, INFO), null);
    await assert.rejects(
      exportWithLayout(whole, () => Promise.reject(new Error('out of memory')), INFO),
      /out of memory/,
    );
  });

  // proves: empty_export
  test('an empty scope is refused before any layout is asked for', async () => {
    const none = exportScope(reading, {
      graph: 'team',
      view: { name: 'robots', spec: { kind: 'kinds', kinds: ['Robot'] } },
    });
    let asked = 0;
    await assert.rejects(
      exportWithLayout(none, () => (asked++, Promise.resolve(null)), INFO),
      /nothing to export/,
    );
    assert.equal(asked, 0);
  });
});

const DATA_INFO = { note: 'Trips/Team.md', date: '2026-10-11' };
/** The things and links of `graph` as read, kept to the things `keep` names and the links between them. */
function readData(r, graph, keep = () => true) {
  const { things, links } = dataOf(r.world[graph]);
  const kept = things.filter(([id]) => keep(id));
  const ids = new Set(kept.map(([id]) => id));
  return { things: kept, links: links.filter(([from, , to]) => ids.has(from) && ids.has(to)) };
}

describe('the data exports', () => {
  // proves: export_data_formats
  test('the data is offered as a GQL block, as CSV and as GraphML', () => {
    assert.deepEqual([...DATA_FORMATS], ['gql', 'csv', 'graphml']);
  });

  // proves: export_data_formats, export_lossless
  test('the whole diagram’s data reads back, in each format, into the very things and links of the graph', () => {
    const data = exportedData(reading, exportScope(reading, { graph: 'team' }));
    const want = readData(reading, 'team');
    assert.equal(want.things.length, 6);
    assert.equal(want.links.length, 5);
    for (const format of DATA_FORMATS)
      assert.deepEqual(readBack(format, dataText(data, format, DATA_INFO)), want, format);
  });

  // proves: export_lossless, view_export_stays_view
  test('a view’s data is the things in the view and the links between them, with or without its faded context', () => {
    const inView = new Set(['alice', 'bob', 'carol', 'core']);
    const want = readData(reading, 'team', (id) => inView.has(id));
    assert.equal(want.links.length, 4);
    for (const context of [false, true]) {
      const data = exportedData(reading, exportScope(reading, { graph: 'team', view: AROUND, context }));
      for (const format of DATA_FORMATS)
        assert.deepEqual(readBack(format, dataText(data, format, DATA_INFO)), want, `${format}, context ${context}`);
    }
  });

  // proves: export_lossless
  test('every value the profile reads comes back as itself: texts, numbers, truth values, days and instants', () => {
    const odd = readNote([
      String.raw`// graph: odd
(a:Note:Draft {title: 'It\'s "quoted", with a comma', body: 'two\nlines\r\nand a\ttab', formula: '=SUM(A1:A2)', minus: '-1', at: '@me', plus: '+44', lead: '\'quoted', blank: '', space: ' ', marks: 'a & b < c > d ]]>', unicode: 'café 🙂 é'}),
(b:Note {id: 'not a name: has spaces', n: 3, neg: -2.5, big: 1e21, tiny: 1.5e-7, zero: 0, negzero: -0, yes: TRUE, no: FALSE, day: DATE '2026-10-11', at: DATETIME '2026-10-11T09:30:00+01:00', exact: DATETIME '2026-10-11T09:30:00.25Z'}),
(match:Thing {name: 'A keyword for an id'}),
(thing_1:Thing {name: 'Named like a made-up name'}),
(c {id: 'kindless'}),
(d:Mixed {size: 3}),
(e:Mixed {size: 'large'}),
(a)-[:SAYS {weight: 2, note: 'line\nbreak', since: DATE '2020-01-01'}]->(b),
(b)-[:SAYS]->(a),
(a)-[:SAYS]->(b),
(a)-[:SAYS {weight: 'heavy'}]->(a),
(c)-[:SAYS]->(match)`,
    ]);
    const want = readData(odd, 'odd');
    assert.equal(want.things.length, 7);
    assert.ok(Object.is(want.things[1][2].negzero, -0), 'the reader keeps -0');
    const data = exportedData(odd, exportScope(odd, { graph: 'odd' }));
    for (const format of DATA_FORMATS) {
      const back = readBack(format, dataText(data, format, DATA_INFO));
      assert.deepEqual(back, want, format);
      assert.ok(Object.is(back.things[1][2].negzero, -0), `${format} keeps -0`);
    }
  });

  // proves: export_lossless
  test('a graph too large to draw still exports its data whole, and each format reads back the same', () => {
    const n = LAYOUT_LIMITS.things + 1000;
    const lines = Array.from({ length: n }, (_, i) => `(t${i}:Thing {name: 'Thing ${i}', n: ${i}})`);
    for (let i = 0; i < n; i++) lines.push(`(t${i})-[:NEXT {step: ${i}}]->(t${(i + 1) % n})`);
    for (let i = 0; i < n; i += 2) lines.push(`(t${i})-[:SKIP]->(t${(i + 7) % n})`);
    const big = readNote([`// graph: big\n${lines.join(',\n')}`]);
    assert.equal(big.tooLarge, undefined, 'within what a note may hold');
    const want = readData(big, 'big');
    assert.ok(want.things.length > LAYOUT_LIMITS.things, 'over the drawing limits');
    assert.equal(want.links.length, n + n / 2);
    const data = exportedData(big, exportScope(big, { graph: 'big' }));
    for (const format of DATA_FORMATS)
      assert.deepEqual(readBack(format, dataText(data, format, DATA_INFO)), want, format);
  });
});

describe('an image too large for one sharp PNG', () => {
  const MOST = 4_000_000;
  const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  // proves: big_export
  test('is split across pages, each sharp and within the pixels allowed, together covering the image once', () => {
    const pages = pngPages(3000, 1700, MOST);
    assert.ok(pages.length > 1, 'more than one page');
    let area = 0;
    for (const p of pages) {
      const s = pngSize(p.width, p.height);
      assert.ok(s.scale >= PNG_MIN_SCALE, 'twice natural size or more');
      assert.ok(s.width * s.height <= MOST, `${s.width} by ${s.height} is within the pixels allowed`);
      assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.width <= 3000 && p.y + p.height <= 1700, 'inside the image');
      area += p.width * p.height;
    }
    assert.equal(area, 3000 * 1700, 'every part of the image is on a page');
    for (const [i, a] of pages.entries())
      for (const b of pages.slice(i + 1)) assert.ok(!overlaps(a, b), 'no part is on two pages');
    // in reading order: along each row, then down
    const order = pages.map((p) => [p.y, p.x]);
    assert.deepEqual(
      order,
      [...order].sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    );
  });

  // proves: big_export
  test('an image that fits is one page, the whole of it; a wide one is split into columns only, a tall one into rows', () => {
    assert.deepEqual(pngPages(300, 200, 16_777_216), [{ x: 0, y: 0, width: 300, height: 200 }]);
    const wide = pngPages(6000, 300, MOST);
    assert.ok(wide.length > 1 && wide.every((p) => p.y === 0 && p.height === 300));
    const tall = pngPages(300, 6000, MOST);
    assert.ok(tall.length > 1 && tall.every((p) => p.x === 0 && p.width === 300));
  });

  // proves: big_export
  test('an image of fractional size is covered to its edge, the last page of each row and column the rest', () => {
    const pages = pngPages(2501.5, 1333.25, MOST);
    const right = Math.max(...pages.map((p) => p.x + p.width)),
      bottom = Math.max(...pages.map((p) => p.y + p.height));
    assert.ok(Math.abs(right - 2501.5) < 1e-9 && Math.abs(bottom - 1333.25) < 1e-9);
    for (const p of pages) assert.ok(pngSize(p.width, p.height).width * pngSize(p.width, p.height).height <= MOST);
  });

  // proves: big_export, export_png_sharp
  test('pages too small to read, or too many of them, are no split at all: the image is refused as too large', () => {
    assert.equal(pngPages(3000, 1700, 100), null);
    assert.equal(pngPages(100_000, 100_000, MOST), null);
  });

  // proves: big_export
  test('each page is the image cut to its part: the same drawing, with its own size and view box', () => {
    const image = exportSvg(exportScope(reading, { graph: 'team' }), engine, INFO);
    const page = { x: 10, y: 20.5, width: 100, height: 50 };
    const cut = pageSvg(image.svg, page);
    const root = /^<svg\b[^>]*>/.exec(cut)[0];
    assert.match(root, /\swidth="100"/);
    assert.match(root, /\sheight="50"/);
    assert.match(root, /\sviewBox="10 20\.5 100 50"/);
    assert.equal(cut.slice(root.length), image.svg.slice(/^<svg\b[^>]*>/.exec(image.svg)[0].length));
  });
});
