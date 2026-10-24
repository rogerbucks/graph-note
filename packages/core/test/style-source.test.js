// Nudges applied to the layout (editor spec §6). Beside, before and group are written into the Graphviz source after it
// is made, and direction is set on the drawing. So the source the Python library writes is never changed. A drawing
// with no nudges is laid out from exactly that source.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { loadEngine } from '../src/engine.ts';
import { drawingSource, layoutSource } from '../src/layout.ts';
import { draw } from '../src/render.ts';
import { readStyle } from '../src/style.ts';
import { nudgedDrawing, nudgedSource, styledDrawing } from '../src/style-source.ts';

const TRIP = `// graph: trip
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Cafe {name: 'Cafe'}),
(lake:Place {name: 'The lake'}),
(home)-[:NEAR]->(park),
(park)-[:NEAR]->(lake)`;

/** The drawing of graph trip, and its style read from a style block of the given lines. */
function styled(...lines) {
  const texts = [TRIP, ['// graph: trip_style · STYLE trip', ...lines].join('\n')];
  const reading = readNote(texts);
  const { style, problems } = readStyle(texts, 'trip', reading);
  assert.deepEqual(problems, []);
  const drawing = reading.graphs.get('trip');
  return { drawing, style, keys: drawing.boxes.map((b) => b.key) };
}

describe('with no nudges', () => {
  // proves: no_nudges_layout_places
  test('the source is byte-identical to the layout source, in either direction', () => {
    const { drawing, style, keys } = styled();
    for (const rankdir of ['LR', 'TB']) {
      const dot = layoutSource(drawing, rankdir).source;
      assert.equal(nudgedSource(dot, style.nudges, keys), dot);
      assert.equal(nudgedSource(drawingSource(drawing, rankdir), [], keys), drawingSource(drawing, rankdir));
    }
    assert.equal(nudgedDrawing(drawing, style), drawing);
  });

  // proves: no_nudges_layout_places
  test('the layout places every box', async () => {
    const { drawing } = styled();
    const drawn = draw(drawing, await loadEngine());
    assert.equal([...drawn.svg.matchAll(/<g id="node\d+" class="node">/g)].length, drawing.boxes.length);
  });
});

describe('each nudge', () => {
  // proves: four_nudge_words
  test('beside puts two things on one rank; before orders them with a link never drawn', () => {
    const { drawing, style, keys } = styled(
      "(n1:Nudge {word: 'beside', thing: 'home', other: 'cafe'}),",
      "(n2:Nudge {word: 'before', thing: 'cafe', other: 'lake'})",
    );
    const dot = layoutSource(drawing, 'LR').source;
    const out = nudgedSource(dot, style.nudges, keys);
    assert.equal(out, dot.replace(/\}$/, '  {rank=same; "home"; "cafe";}\n  "cafe" -> "lake" [style=invis];\n}'));
  });

  // proves: four_nudge_words
  test('group draws its things in a box labelled with the group, one box for each label', () => {
    const { drawing, style, keys } = styled(
      "(n1:Nudge {word: 'group', thing: 'home', group: 'Dry \"land\"'}),",
      "(n2:Nudge {word: 'group', thing: 'lake', group: 'Water'}),",
      "(n3:Nudge {word: 'group', thing: 'park', group: 'Dry \"land\"'})",
    );
    const dot = layoutSource(drawing, 'TB').source;
    const nudged = nudgedSource(dot, style.nudges, keys);
    const added = nudged.split('\n').filter((l) => l.includes('subgraph'));
    const box = (n, label, members) =>
      `  subgraph cluster_${n} {label=<${label}>; fontname="Helvetica"; fontsize=9; fontcolor="#0000fe"; ` +
      `color="#0000fe"; style="rounded"; ${members}}`;
    assert.deepEqual(added, [box(1, 'Dry &quot;land&quot;', '"home"; "park"; '), box(2, 'Water', '"lake"; ')]);
    assert.match(nudged, /^digraph[^\n]*\{\n {2}newrank=true;/, 'groups lay out with newrank, so none is dropped');
  });

  // proves: four_nudge_words
  test('direction sets the direction the drawing is laid out in', () => {
    const { drawing, style } = styled("(n1:Nudge {word: 'direction', direction: 'TB'})");
    assert.deepEqual(nudgedDrawing(drawing, style), { ...drawing, direction: 'TB' });
    assert.equal(drawing.direction, undefined, 'the drawing read is not changed');
  });

  // proves: untangle_routing
  test('the drawing is routed as its Links says, a view’s own over the whole graph’s; said nowhere, it is left to the default', () => {
    const { drawing, style } = styled(
      "(r1:Links {routing: 'straight'}),",
      "(r2:Links {view: 'near', routing: 'right-angled'}),",
      "(r3:Links {view: 'round', routing: 'curved'})",
    );
    assert.equal(styledDrawing(drawing, style).routing, 'straight');
    assert.equal(styledDrawing(drawing, style, undefined, 'near').routing, 'right-angled');
    assert.equal(styledDrawing(drawing, style, undefined, 'round').routing, 'curved');
    assert.equal('routing' in styledDrawing(drawing, styled().style), false);
  });

  // proves: four_nudge_words
  test('a nudge naming a thing not drawn here, as outside a view, is left out of the source', () => {
    const { drawing, style } = styled(
      "(n1:Nudge {word: 'beside', thing: 'home', other: 'cafe'}),",
      "(n2:Nudge {word: 'group', thing: 'cafe', group: 'Inside'})",
    );
    const dot = layoutSource(drawing, 'LR').source;
    assert.equal(nudgedSource(dot, style.nudges, ['home', 'park', 'lake']), dot);
  });

  // proves: four_nudge_words
  test('a nudged source is laid out, the boxes beside each other sharing a rank', async () => {
    const { drawing, style, keys } = styled(
      "(n1:Nudge {word: 'beside', thing: 'home', other: 'lake'}),",
      "(n2:Nudge {word: 'group', thing: 'cafe', group: 'Inside'})",
    );
    const engine = await loadEngine();
    const svg = engine.render(nudgedSource(layoutSource(drawing, 'TB').source, style.nudges, keys));
    const y = (key) => {
      const g = new RegExp(`<title>${key}</title>[\\s\\S]*?<text[^>]*\\sy="([-\\d.]+)"`).exec(svg);
      assert.ok(g, `${key} is drawn`);
      return Number(g[1]);
    };
    assert.equal(y('home'), y('lake'));
    assert.match(svg, /<g id="clust\d+" class="cluster">\s*<title>cluster_1<\/title>/);
    assert.equal([...svg.matchAll(/<g id="node\d+" class="node">/g)].length, drawing.boxes.length);
  });

  // proves: four_nudge_words
  test('a group of things of one kind with no link between them is drawn in its box, never dropped', async () => {
    const people = `// graph: team
(ann:Person {name: 'Ann'}), (bob:Person {name: 'Bob'}), (cat:Person {name: 'Cat'}),
(t1:Team {name: 'One'}), (t2:Team {name: 'Two'}),
(ann)-[:IN]->(t1), (bob)-[:IN]->(t1), (cat)-[:IN]->(t2)`;
    const texts = [
      people,
      "// graph: team_style · STYLE team\n(g1:Nudge {word: 'group', thing: 'ann', group: 'G'}),\n(g2:Nudge {word: 'group', thing: 'bob', group: 'G'})",
    ];
    const reading = readNote(texts);
    const { style } = readStyle(texts, 'team', reading);
    const drawing = reading.graphs.get('team');
    const engine = await loadEngine();
    const svg = engine.render(
      nudgedSource(
        layoutSource(drawing, 'TB').source,
        style.nudges,
        drawing.boxes.map((b) => b.key),
      ),
    );
    assert.match(svg, /<title>cluster_1<\/title>/, 'the group’s box is drawn');
  });

  // proves: broken_style_block
  test('a group label with a backslash or a quote is drawn as written, and never stops the drawing', async () => {
    const { drawing, keys } = styled();
    const nudges = [{ word: 'group', thing: 'cafe', group: 'C:\\ "inside"\\n', at: { block: 1, line: 2, id: 'g' } }];
    const engine = await loadEngine();
    const svg = engine.render(nudgedSource(layoutSource(drawing, 'TB').source, nudges, keys));
    assert.match(svg, /<title>cluster_1<\/title>/);
    assert.match(svg, /C:\\ &quot;inside&quot;\\n/);
  });
});

describe('before, in a radial drawing', () => {
  // proves: radial_spoke_order
  test('moves the thing just before the other in the order the boxes are written, which the radial layout follows', () => {
    const { drawing, style, keys } = styled("(n1:Nudge {word: 'before', thing: 'lake', other: 'park'})");
    const dot = layoutSource(drawing, 'LR').source;
    const out = nudgedSource(dot, style.nudges, keys, { type: 'radial' });
    const written = (src) => [...src.matchAll(/^ {2}"(\w+)" \[label=/gm)].map((m) => m[1]);
    assert.deepEqual(written(dot), ['home', 'park', 'cafe', 'lake']);
    assert.deepEqual(written(out), ['home', 'lake', 'park', 'cafe']);
    assert.ok(
      !out.includes('style=invis'),
      'no link never drawn: in a radial drawing it would move a box off its ring',
    );
    assert.equal(out.split('\n').length, dot.split('\n').length, 'every line kept');
  });
});

const HUB = `// graph: hub
(sun:Thing {name: 'Sun'}),
(a:Thing {name: 'A'}),
(b:Thing {name: 'B'}),
(c:Thing {name: 'C'}),
(d:Thing {name: 'D'}),
(sun)-[:SEES]->(a),
(sun)-[:SEES]->(b),
(sun)-[:SEES]->(c),
(sun)-[:SEES]->(d)`;

/** The things around the centre of a radial drawing, in order anticlockwise as drawn (the drawing's y
 * runs down the page), from A. */
async function spokes(...nudges) {
  const texts = [HUB, ['// graph: hub_style · STYLE hub', "(d1:Diagram {type: 'radial'})", ...nudges].join('\n')];
  const reading = readNote(texts);
  const { style } = readStyle(texts, 'hub', reading);
  const { svg } = draw(styledDrawing(reading.graphs.get('hub'), style, reading.world.hub), await loadEngine());
  // each box by the name drawn last in it, where that name sits
  const at = Object.fromEntries(
    [...svg.matchAll(/<g id="node\d+" class="node">([\s\S]*?)<\/g>/g)].map((m) => {
      const [, x, y, name] = [...m[1].matchAll(/<text[^>]* x="([-\d.]+)" y="([-\d.]+)"[^>]*>([^<]*)<\/text>/g)].at(-1);
      return [name.toLowerCase(), [+x, +y]];
    }),
  );
  const [cx, cy] = at.sun;
  const turn = (k) =>
    (Math.atan2(cy - at[k][1], at[k][0] - cx) - Math.atan2(cy - at.a[1], at.a[0] - cx) + 4 * Math.PI) % (2 * Math.PI);
  return ['a', 'b', 'c', 'd'].sort((p, q) => turn(p) - turn(q));
}

describe('the order around the centre of a radial drawing', () => {
  // proves: radial_spoke_order
  test('follows the before nudges: a thing written before another is drawn next to it, just before it', async () => {
    const was = await spokes();
    const moved = await spokes(",(n1:Nudge {word: 'before', thing: 'd', other: 'b'})");
    const after = (order, k) => order[(order.indexOf(k) + 1) % order.length];
    assert.notEqual(after(was, 'd'), 'b', 'D is not just before B to begin with');
    assert.equal(after(moved, 'd'), 'b', 'moved, D is drawn just before B');
  });
});
