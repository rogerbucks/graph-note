// Exports carry title, legend and source (editor spec §16): an image of the whole diagram or of a view, as SVG or PNG, with
// its theme colours fixed so it reads the same outside Obsidian, drawn at no less than twice natural size, and saying on
// its face what it is, what its colours mean, and which note and day it came from. A view export holds only the view,
// unless the faded context is asked for. The data exports (a GQL block, CSV, GraphML) are slice 3.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import GraphLayout from '@graph-note/graph-spec/src/graph-layout.js';
import { loadEngine } from '../src/engine.ts';
import { readNote } from '../src/drawing.ts';
import { EXPORT_FORMATS, PNG_MIN_SCALE, exportSvg, pngSize } from '../src/export.ts';
import { exportScope } from '../src/export-scope.ts';
import { FADED_OPACITY } from '../src/export-marks.ts';
import { STYLE } from '../src/layout.ts';
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
