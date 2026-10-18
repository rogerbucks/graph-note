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
  test('the drawing is routed as its Links says, a view’s own over the whole graph’s; curved is as it was', () => {
    const { drawing, style } = styled(
      "(r1:Links {routing: 'straight'}),",
      "(r2:Links {view: 'near', routing: 'right-angled'}),",
      "(r3:Links {view: 'round', routing: 'curved'})",
    );
    assert.equal(styledDrawing(drawing, style).routing, 'straight');
    assert.equal(styledDrawing(drawing, style, undefined, 'near').routing, 'right-angled');
    assert.equal('routing' in styledDrawing(drawing, style, undefined, 'round'), false);
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
