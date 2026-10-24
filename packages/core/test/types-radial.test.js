// A radial drawing around a chosen centre (editor spec §15, radial_centre_chosen). The style graph's Diagram may name
// the thing at the middle of a radial drawing. The others sit in rings by how many links away they are. With none named,
// or the one named not in the drawing, the centre is the thing with the most links. Around a thing picked it is always
// drawn (radial_centre_anywhere). Spans types.ts and the style checks.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { directions, draw } from '../src/render.ts';
import { loadEngine } from '../src/engine.ts';
import { readStyle } from '../src/style.ts';
import { styledDrawing } from '../src/style-source.ts';
import { diagramFor } from '../src/types.ts';

const LONE = `// graph: lone
(a:Thing {name: 'A'}),
(b:Thing {name: 'B'}),
(c:Thing {name: 'C'}),
(a)-[:SEES]->(b)`;

/** Graph `graph` of a note of `data`, its style a style block of the given lines, as a host reads it. */
function shown(data, ...lines) {
  const graph = /^\/\/ graph: (\w+)/.exec(data)[1];
  const texts = [data, [`// graph: ${graph}_style · STYLE ${graph}`, ...lines].join('\n')];
  const reading = readNote(texts);
  const { style, problems } = readStyle(texts, graph, reading);
  return { plain: reading.graphs.get(graph), style, problems, g: reading.world[graph] };
}

const SKY = `// graph: sky
(sun:Star {name: 'Sun'}),
(earth:Planet {name: 'Earth'}),
(mars:Planet {name: 'Mars'}),
(moon:Moon {name: 'The moon'}),
(earth)-[:CIRCLES]->(sun),
(mars)-[:CIRCLES]->(sun),
(moon)-[:CIRCLES]->(earth)`;

describe('a radial drawing around a chosen centre', () => {
  // proves: radial_centre_chosen
  test('is laid out around the thing the style graph names, the others in rings by how far they are', () => {
    const usual = shown(SKY, "(d1:Diagram {type: 'radial'})");
    assert.equal(diagramFor(usual.plain, usual.style, usual.g).plan?.centre, 'sun', 'the most links, by default');
    const { plain, style, g, problems } = shown(SKY, "(d1:Diagram {type: 'radial', centre: 'moon'})");
    assert.deepEqual(problems, []);
    assert.equal(style.diagrams[0]?.centre, 'moon');
    assert.deepEqual(diagramFor(plain, style, g), {
      chosen: 'radial',
      drawn: 'radial',
      plan: { type: 'radial', centre: 'moon' },
    });
    for (const d of directions(styledDrawing(plain, style, g))) assert.match(d.dot, /layout=twopi, root="moon"/);
  });

  // proves: radial_centre_chosen
  test('is drawn around any thing, even one with a single link, whose rings Graphviz once failed to draw', async () => {
    const engine = await loadEngine();
    for (const centre of ['sun', 'earth', 'mars', 'moon']) {
      const { plain, style, g } = shown(SKY, `(d1:Diagram {type: 'radial', centre: '${centre}'})`);
      assert.match(draw(styledDrawing(plain, style, g), engine).svg, /<svg/, `drawn around ${centre}`);
    }
  });

  // proves: radial_centre_anywhere
  test('is drawn even with a thing joined to nothing, two things, or a group (Roger, 24 Oct 2026)', async () => {
    const engine = await loadEngine();
    const around = (data, centre, ...more) => {
      const { plain, style, g } = shown(data, `(d1:Diagram {type: 'radial', centre: '${centre}'})`, ...more);
      const drawing = styledDrawing(plain, style, g);
      const boxes = draw(drawing, engine).svg.match(/class="node"/g) ?? [];
      assert.deepEqual([drawing.diagram?.type, boxes.length], ['radial', drawing.boxes.length], centre);
    };
    around(LONE, 'c');
    around(`// graph: pair\n(a:Thing {name: 'A'}),\n(b:Thing {name: 'B'})`, 'b');
    around(SKY, 'moon', "(n1:Nudge {word: 'group', thing: 'mars', group: 'Red'})");
  });

  // proves: radial_centre_chosen
  test('falls back to the usual centre when the chosen one is not in the drawing', () => {
    const { plain, style, g } = shown(SKY, "(d1:Diagram {type: 'radial', centre: 'moon'})");
    const without = { ...plain, boxes: plain.boxes.filter((b) => b.key !== 'moon') };
    without.links = plain.links.filter((l) => l.from !== 'moon' && l.to !== 'moon');
    assert.equal(diagramFor(without, style, g).plan?.centre, 'sun');
  });

  // proves: radial_centre_chosen
  test('is a problem with its fix for another type, or for a thing the graph does not have', () => {
    const flow = shown(SKY, "(d1:Diagram {type: 'flow', centre: 'moon'})");
    assert.deepEqual(
      flow.problems.map((p) => [p.message, p.fix]),
      [['a centre is chosen only for a radial drawing', "remove centre, or make it type: 'radial'"]],
    );
    const none = shown(SKY, "(d1:Diagram {type: 'radial', centre: 'pluto'})");
    assert.equal(none.problems.length, 1);
    assert.match(none.problems[0].message, /pluto/);
  });
});
