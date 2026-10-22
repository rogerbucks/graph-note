// A built-in drawing's SVG, written by the core from its marks (editor spec §43, plugin_interface). Graphviz only lays
// it out. These prove the SVG written from the marks is the one Graphviz writes, part for part and number for number.
// So the view, the theme and every host read it as before. Each source has one thing that could go wrong.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { instance } from '@viz-js/viz';
import { layoutMarks } from '../src/graphviz-marks.ts';
import { layoutSvg } from '../src/graphviz-svg.ts';
import { drawMarksOf } from '../src/drawing-marks.ts';
import { loadEngine } from '../src/engine.ts';

const viz = await instance();
/** The SVG without Graphviz's own comments, line by line: no host reads them. */
function uncommented(svg) {
  const kept = [];
  let inside = false;
  for (const line of svg.split('\n')) {
    if (inside || line.startsWith('<!--')) inside = !line.endsWith('-->');
    else kept.push(line);
  }
  return kept.join('\n');
}
const graphviz = (dot) => uncommented(viz.renderString(dot, { format: 'svg' }));
const ours = (dot) => layoutSvg(layoutMarks(viz.renderJSON(dot)));

const STYLE = `graph [rankdir=LR, ranksep=0.55, nodesep=0.5, bgcolor="transparent", pad=0.1];
  node [shape=box, style="rounded,filled", fontname="Helvetica", fontsize=12.5, fontcolor="#0000fd", penwidth=1.2,
    fillcolor="#000100", color="#000200"];
  edge [fontname="Helvetica", fontsize=10.5, fontcolor="#0000fe", color="#0000fc", arrowsize=0.7, penwidth=1.0];`;

const SOURCES = {
  'the plainest graph, with the page Graphviz fills and its own room round it': 'digraph { a -> b }',
  'a styled graph with a kind, a reading and a label of two lines': `digraph G { ${STYLE}
    "loan" [label="Loan\\nterms", fillcolor="#000100", color="#000200"]; "b" [fillcolor="#000101", color="#000201"];
    "loan" -> "b" [label="owes", color="#000300", fontcolor="#000400"]; }`,
  'a label as a table, with the square kept for a picture': `digraph G { ${STYLE}
    "tom" [label=<<table border="0"><tr><td fixedsize="true" width="48" height="48" bgcolor="#0005fe"></td></tr>
    <tr><td><font point-size="9" color="#0000fe">CAT</font></td></tr><tr><td>Tom</td></tr></table>>]; }`,
  'clusters inside clusters, and one inside a subgraph that is not one': `digraph G { ${STYLE}
    subgraph x { rank=same; subgraph cluster_b { label="B"; b1; subgraph cluster_c { label="C"; c1; } } }
    subgraph cluster_a { label="A"; style="rounded,dashed"; color="#0000fe"; a1; } a1 -> b1; c1 -> a1; }`,
  'ids and classes the core gives, on things and links': `digraph G { ${STYLE}
    "hub" [id="fold_hub_1", class="thoughtknot-stub"]; "x"; "hub" -> "x" [id="e9", class="thoughtknot-flow dot"]; }`,
  'links written out of order, and hidden ones that still lead to the thing they reach': `digraph G { ${STYLE}
    q; l; s; e; s -> l; e -> s; l -> q [style=invis]; e -> q; x [style=invis]; e -> x; }`,
  'a point, a dashed outline, a heavy link and a link both ways': `digraph G { ${STYLE}
    p [shape=point]; d [style=dashed, color="#0000fe"]; p -> d [penwidth=2.5, dir=both]; }`,
  'text that must be escaped, and spaces kept': `digraph G { ${STYLE}
    "a<b>" [label="Tom & \\"Rex\\" -  two  spaces"]; "a<b>" -> c [label="it's"]; }`,
  'an undirected graph': 'graph { a -- b; b -- c; }',
};

describe("the SVG written from the marks is Graphviz's own (plugin_interface)", () => {
  for (const [name, dot] of Object.entries(SOURCES))
    test(name, () => {
      const laid = layoutMarks(viz.renderJSON(dot));
      assert.ok(Array.isArray(drawMarksOf(laid.marks, laid.space)), drawMarksOf(laid.marks, laid.space));
      assert.equal(ours(dot), graphviz(dot));
    });

  test("marks that cannot give the drawing back exactly say so: a label Graphviz's JSON leaves out", () => {
    const dot = `digraph G { ${STYLE} subgraph cluster_1 { label="C:\\\\ \\"inside\\"\\\\n"; a; } }`;
    assert.equal(layoutMarks(viz.renderJSON(dot)).layout.lost, true);
  });

  test('and a colour that is no stand-in, which no style token gives back', () => {
    const dot = 'digraph { a [style=filled, fillcolor="lightgrey"]; }';
    assert.equal(layoutMarks(viz.renderJSON(dot)).layout.lost, true);
    assert.equal(layoutMarks(viz.renderJSON(SOURCES['an undirected graph'])).layout.lost, undefined);
  });

  test('marks with no layout are written in their order on top, in the space they were given', () => {
    const box = { id: 'a', style: 'kind.0', kind: 'box', x: 0, y: 0, width: 40, height: 20, z: 1 };
    const text = {
      id: 'a.label',
      style: 'text',
      kind: 'label',
      x: 20,
      y: 12,
      text: 'A & B',
      size: 12,
      anchor: 'middle',
    };
    const svg = layoutSvg({ marks: [box, text], space: { width: 80, height: 40 } });
    assert.match(svg, /<svg width="60pt" height="30pt"/);
    assert.ok(svg.indexOf('A &amp; B') < svg.indexOf('<polygon'), 'the box, higher on top, is written after the text');
  });

  test("the engine gives a drawing's marks too, and drawn from them it is the SVG the engine draws", async () => {
    const engine = await loadEngine();
    const dot = SOURCES['a styled graph with a kind, a reading and a label of two lines'];
    assert.equal(layoutSvg(engine.marks(dot)), uncommented(engine.render(dot)));
  });
});
