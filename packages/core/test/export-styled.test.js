// An exported image drawn with its style graph (editor spec §14, §15, §16). It has the arrowheads the style graph hides
// and the properties it shows inline, for the whole diagram or a view. Each link's properties are its own even where
// the view leaves out a link before it. Spans export.ts (styledDrawing, with ExportInfo's data) and export-scope.ts
// (each kept link's edge).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from '../src/engine.ts';
import { readNote } from '../src/drawing.ts';
import { exportSvg, exportWithLayout } from '../src/export.ts';
import { exportedData } from '../src/export-data.ts';
import { exportScope } from '../src/export-scope.ts';
import { readStyle } from '../src/style.ts';

const engine = await loadEngine();
const texts = (svg) => [...svg.matchAll(/>([^<>]+)<\/(?:text|tspan)>/g)].map((m) => m[1]);

describe('arrowheads and properties in an export', () => {
  // two links between home and park, one each way. A view of how home reaches park, following the arrows, keeps only
  // the second. So the link it draws first is the graph's second
  const WALK = [
    `// graph: walk · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(park)-[:NEAR {miles: 9}]->(home),
(home)-[:NEAR {miles: 2}]->(park)`,
    `// graph: walk_style · STYLE walk
(s1:Show {property: 'miles', type: 'NEAR'}),
(a1:Arrows {arrowheads: 'hide'})`,
  ];
  const walked = readNote(WALK);
  const styled = readStyle(WALK, 'walk', walked);
  assert.deepEqual(styled.problems, []);
  const info = {
    note: 'Trips/Walk.md',
    date: '2026-10-11',
    theme: 'light',
    style: styled.style,
    data: walked.world.walk,
  };
  const edgeGroups = (svg) =>
    svg
      .split('class="edge"')
      .slice(1)
      .map((g) => g.split('</g>')[0]);

  // proves: properties_switch, arrows_switchable
  test('the whole diagram is drawn with the arrowheads hidden and the properties shown', () => {
    const { svg } = exportSvg(exportScope(walked, { graph: 'walk' }), engine, info);
    const edges = edgeGroups(svg);
    assert.equal(edges.length, 2);
    for (const e of edges) assert.ok(!e.includes('<polygon'), 'no arrowhead');
    assert.ok(texts(svg).includes('miles: 9') && texts(svg).includes('miles: 2'), texts(svg).join(' | '));
  });

  // proves: properties_switch
  test("a view that leaves out one of two parallel links shows the other link's own properties", async () => {
    const view = { name: 'there', spec: { kind: 'reaches', from: 'home', to: 'park', steps: 1, directed: true } };
    const scope = exportScope(walked, { graph: 'walk', view });
    assert.equal(scope.drawing.links.length, 1, 'only the link from home to park');
    assert.equal(scope.drawing.links[0].edge, 1, 'which says it is the graph’s second link');
    const said = texts(exportSvg(scope, engine, info).svg);
    assert.ok(said.includes('miles: 2'), said.join(' | '));
    assert.ok(!said.includes('miles: 9'), 'never the left-out link’s');
    // laid out by the host's layout, the same drawing reaches it
    let laid;
    await exportWithLayout(scope, (d) => ((laid = d), Promise.resolve(null)), info);
    assert.deepEqual(laid.inline, { boxes: [], links: [[0, [['miles', '2']]]] });
    assert.deepEqual(laid.arrowless, [0]);
  });

  // proves: properties_switch
  test("the view's own links are still where the data export finds them, beside each link's edge", () => {
    const view = { name: 'there', spec: { kind: 'reaches', from: 'home', to: 'park', steps: 1, directed: true } };
    const scope = exportScope(walked, { graph: 'walk', view });
    assert.deepEqual(scope.linksAt, [1]);
    assert.deepEqual(
      scope.drawing.links.map((l) => l.edge),
      [1],
    );
    // the data export finds the link the view holds by linksAt: the written link from home to park, never the other
    assert.deepEqual(exportedData(walked, scope).links, [['home', 'NEAR', 'park', { miles: 2 }]]);
  });
});
