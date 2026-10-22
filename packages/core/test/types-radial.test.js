// A radial drawing around a chosen centre (editor spec §15, radial_centre_chosen). The style graph's Diagram may name
// the thing at the middle of a radial drawing. The others sit in rings by how many links away they are. With none named,
// or the one named not in the drawing, the centre is the thing with the most links. Spans types.ts and the style checks.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { directions } from '../src/render.ts';
import { readStyle } from '../src/style.ts';
import { styledDrawing } from '../src/style-source.ts';
import { diagramFor, diagramOffer } from '../src/types.ts';

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
  test('says the chosen centre when a thing is not joined to it', () => {
    const { plain, style, g } = shown(LONE, "(d1:Diagram {type: 'radial', centre: 'c'})");
    const radial = diagramOffer(plain, style, g).fits.find((f) => f.type === 'radial');
    assert.equal(radial.why, 'a radial drawing needs every thing joined to the centre, C, and A is not');
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
