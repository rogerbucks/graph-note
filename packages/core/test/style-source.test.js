// Nudges applied to the layout (editor spec §6): beside, before and group written into the Graphviz source after it is
// made, and direction set on the drawing, so the source the Python library writes is never changed and a drawing with no
// nudges is laid out from exactly that source.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { loadEngine } from '../src/engine.ts';
import { drawingSource, layoutSource } from '../src/layout.ts';
import { draw } from '../src/render.ts';
import { readStyle } from '../src/style.ts';
import { nudgedDrawing, nudgedSource } from '../src/style-source.ts';

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
    const added = nudgedSource(dot, style.nudges, keys)
      .slice(dot.length - 1, -1)
      .split('\n')
      .filter(Boolean);
    const box = (n, label, members) =>
      `  subgraph cluster_${n} {label="${label}"; fontname="Helvetica"; fontsize=9; fontcolor="#0000fe"; ` +
      `color="#0000fe"; style="rounded"; ${members}}`;
    assert.deepEqual(added, [box(1, 'Dry &quot;land&quot;', '"home"; "park"; '), box(2, 'Water', '"lake"; ')]);
  });

  // proves: four_nudge_words
  test('direction sets the direction the drawing is laid out in', () => {
    const { drawing, style } = styled("(n1:Nudge {word: 'direction', direction: 'TB'})");
    assert.deepEqual(nudgedDrawing(drawing, style), { ...drawing, direction: 'TB' });
    assert.equal(drawing.direction, undefined, 'the drawing read is not changed');
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
});
