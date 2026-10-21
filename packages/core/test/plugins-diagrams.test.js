// Diagram types a plug-in adds (editor spec §54, trust_diagram_type_data). A diagram type:
// - gets the graph's shape and the space to draw in, frozen, and no host ability;
// - gives back marks as data, which the core checks and draws, escaping every label;
// - never writes markup into the page, so markup in a label is drawn as text.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PLUGIN_API, pluginRegistry } from '../src/plugins.ts';
import { diagramContract } from '../src/plugins-contract.ts';
import { readNote } from '../src/drawing.ts';
import { readStyle } from '../src/style.ts';
import { diagramFor } from '../src/types.ts';
import { shapeOf } from '../src/types-shape.ts';

const SPACE = { width: 400, height: 300 };
const SHAPE = {
  things: [
    { key: 'paris', text: 'Paris', kinds: ['City'] },
    { key: 'rome', text: 'Rome', kinds: ['City'] },
  ],
  links: [{ from: 'paris', type: 'TO', to: 'rome' }],
};

/** A diagram type that draws each thing as a box in a row, and each link as an arrow between them. */
const sankey = {
  type: 'acme.charts.sankey',
  title: 'Sankey',
  draw: ({ shape, space }) => {
    const at = new Map(shape.things.map((t, i) => [t.key, 10 + i * 120]));
    return [
      ...shape.things.map((t) => ({
        kind: 'box',
        x: at.get(t.key),
        y: 10,
        width: 100,
        height: 40,
        label: t.text,
        thing: t.key,
      })),
      ...shape.links.map((l) => ({
        kind: 'line',
        points: [
          [at.get(l.from) + 100, 30],
          [at.get(l.to), 30],
        ],
        arrow: true,
      })),
      { kind: 'text', x: 10, y: space.height - 10, text: `${shape.things.length} things` },
    ];
  },
};
const registered = (diagram = sankey, over = {}) => {
  const registry = pluginRegistry();
  registry.register({
    id: 'acme.charts',
    version: '1.0.0',
    api: PLUGIN_API,
    uses: ['diagrams'],
    register: (points) => points.diagrams.add(diagram),
    ...over,
  });
  return registry;
};

describe('a diagram type a plug-in adds (trust_diagram_type_data)', () => {
  test('is added under its plug-in’s id, as a style graph names it, and listed', () => {
    assert.deepEqual(
      registered()
        .diagramTypes()
        .map((d) => d.type),
      ['acme.charts.sankey'],
    );
    for (const type of ['tree', 'other.charts.sankey', 'acme.charts.Sankey', 'acme.charts'])
      assert.throws(() => registered({ ...sankey, type }), /is not named acme\.charts\.<word>/, type);
  });

  test('gets the graph’s shape and the space, frozen, and no host ability', async () => {
    let got, points;
    const registry = registered(
      {
        ...sankey,
        draw: (given) => {
          got = given;
          return [];
        },
      },
      {
        register: (p) => {
          points = p;
          p.diagrams.add({ ...sankey, draw: (given) => ((got = given), []) });
        },
      },
    );
    assert.equal((await registry.drawDiagram('acme.charts.sankey', SHAPE, SPACE)).ok, true);
    assert.deepEqual(Object.keys(points), ['diagrams']);
    assert.deepEqual(Object.keys(got), ['shape', 'space']);
    assert.deepEqual(got.shape, SHAPE);
    assert.ok(Object.isFrozen(got.shape.things[0]) && Object.isFrozen(got.space));
    assert.throws(() => got.shape.things.push({ key: 'x' }));
    assert.notEqual(got.shape, SHAPE);
  });

  test('gives back marks as data, which the core draws as SVG', async () => {
    const drawn = await registered().drawDiagram('acme.charts.sankey', SHAPE, SPACE);
    assert.equal(drawn.ok, true);
    assert.match(drawn.value, /^<svg [^>]*viewBox="0 0 400 300"/);
    assert.match(
      drawn.value,
      /<g data-thing="paris"><rect class="gn-mark-box" x="10" y="10" width="100" height="40"\/>/,
    );
    assert.match(drawn.value, />Rome<\/text>/);
    assert.match(drawn.value, /<polyline class="gn-mark-line" points="110,30 130,30" fill="none" marker-end=/);
    assert.match(drawn.value, />2 things<\/text>/);
  });

  test('markup in a label, a text or a thing’s name is drawn as text, never as markup', async () => {
    const markup = '<script>alert(1)</script><img src=x onerror="go()">';
    const shape = { things: [{ key: 'a"b', text: markup, kinds: [] }], links: [] };
    const drawn = await registered().drawDiagram('acme.charts.sankey', shape, SPACE);
    assert.equal(drawn.ok, true);
    assert.doesNotMatch(drawn.value, /<script|<img/);
    assert.match(drawn.value, /&lt;script&gt;alert\(1\)&lt;\/script&gt;&lt;img src=x onerror=&quot;go\(\)&quot;&gt;/);
    assert.match(drawn.value, /data-thing="a&quot;b"/);
  });

  test('marks that are not data, or fall outside the space, are refused and named', async () => {
    const cases = [
      ['<svg onload="go()"></svg>', /gave back no list of marks/],
      [[{ kind: 'html', html: '<b>hi</b>' }], /mark 1 is a mark of the kind "html"/],
      [[{ kind: 'box', x: 390, y: 0, width: 20, height: 10 }], /mark 1 is a box outside the space/],
      [[{ kind: 'line', points: [[0, 0]] }], /a line that is not two or more points/],
      [[{ kind: 'text', x: 1, y: 1, text: { toString: () => '<b>' } }], /a piece of text that is not text/],
      [[{ kind: 'box', x: Number.NaN, y: 0, width: 1, height: 1 }], /a box outside the space/],
      [Array.from({ length: 5001 }, () => ({ kind: 'text', x: 0, y: 0, text: '' })), /5001 marks, over the 5000/],
    ];
    for (const [marks, why] of cases) {
      const drawn = await registered({ ...sankey, draw: () => marks }).drawDiagram('acme.charts.sankey', SHAPE, SPACE);
      assert.equal(drawn.ok, false);
      assert.equal(drawn.plugin, 'acme.charts');
      assert.match(drawn.message, /^The diagram type Sankey of acme\.charts was not drawn: /);
      assert.match(drawn.message, why);
    }
  });

  test('only the marks’ own fields are drawn; anything else a mark holds is dropped', async () => {
    const extra = [{ kind: 'box', x: 0, y: 0, width: 10, height: 10, onclick: 'go()', style: 'x' }];
    const drawn = await registered({ ...sankey, draw: () => extra }).drawDiagram('acme.charts.sankey', SHAPE, SPACE);
    assert.doesNotMatch(drawn.value, /onclick|style/);
  });

  test('a diagram type that throws is caught and named, and a missing one says so', async () => {
    const broken = registered({
      ...sankey,
      draw: () => {
        throw new Error('no layout');
      },
    });
    assert.deepEqual(await broken.drawDiagram('acme.charts.sankey', SHAPE, SPACE), {
      ok: false,
      plugin: 'acme.charts',
      message: 'The diagram type Sankey of acme.charts failed: no layout',
    });
    assert.equal(
      (await broken.drawDiagram('acme.charts.flow', SHAPE, SPACE)).message,
      'No plug-in adds the diagram type "acme.charts.flow".',
    );
    assert.match(
      (await registered().drawDiagram('acme.charts.sankey', SHAPE, { width: 0, height: 1 })).message,
      /no width and height/,
    );
  });

  test('a host with the plug-in draws the type a style graph chooses', async () => {
    const graph = "// graph: trip\n(paris:City {name: 'Paris'}),\n(rome:City {name: 'Rome'}),\n(paris)-[:TO]->(rome)";
    const texts = [graph, "// graph: trip_style · STYLE trip\n(d1:Diagram {type: 'acme.charts.sankey'})"];
    const reading = readNote(texts);
    const { style } = readStyle(texts, 'trip', reading);
    const drawing = reading.graphs.get('trip');
    const choice = diagramFor(drawing, style, reading.world.trip);
    const drawn = await registered().drawDiagram(choice.plugin.type, shapeOf(drawing, reading.world.trip), SPACE);
    assert.equal(drawn.ok, true);
    assert.match(drawn.value, />Paris<\/text>/);
  });

  test('its contract passes for a good one, and names the promise a bad one breaks', async () => {
    for (const check of diagramContract(sankey, 'acme.charts')) await check.run();
    const [, marks] = diagramContract({ ...sankey, draw: () => '<svg/>' }, 'acme.charts');
    await assert.rejects(marks.run(), /wanted boxes, lines and text in the space/);
    const [named] = diagramContract(sankey, 'other.charts');
    await assert.rejects(named.run(), /is not named other\.charts\.<word>/);
  });
});
