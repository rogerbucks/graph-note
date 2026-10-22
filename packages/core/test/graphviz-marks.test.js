// Graphviz's layout as drawing marks (editor spec §43, plugin_interface): the first step of drawing a built-in type as
// the core draws a plug-in's. These lay real graphs out with the bundled Graphviz and read its layout back as marks.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { instance } from '@viz-js/viz';
import { layoutMarks } from '../src/graphviz-marks.ts';
import { drawMarksOf, marksBounds } from '../src/drawing-marks.ts';

const viz = await instance();
const laid = (dot) => layoutMarks(viz.renderJSON(dot));

const DOT = `digraph G {
  rankdir=LR;
  subgraph cluster_team { label="Team"; "loan" [label="Loan", shape=box, style="rounded,filled"]; }
  "borrower" [label="Borrower", shape=ellipse];
  "rate" [label="Rate", shape=diamond];
  "loan" -> "borrower" [label="owes"];
  "loan" -> "borrower";
  "borrower" -> "rate" [dir=both];
}`;

describe('Graphviz layout as marks (plugin_interface)', () => {
  test('each thing is a box with its own id, shape and label, and the marks pass the format check', () => {
    const { space, marks } = laid(DOT);
    assert.ok(Array.isArray(drawMarksOf(marks, space)), drawMarksOf(marks, space));
    const box = (key) => marks.find((m) => m.id === `t:${key}`);
    assert.equal(box('loan').shape, 'round');
    assert.equal(box('borrower').shape, 'ellipse');
    assert.equal(box('rate').shape, 'diamond');
    assert.equal(box('loan').name, 'Loan');
    const label = marks.find((m) => m.id === 'l:t:loan');
    assert.equal(label.text, 'Loan');
    assert.equal(label.anchor, 'middle');
    assert.equal(label.of, 'loan');
  });

  test('a cluster is a group with its label, and the boxes sit inside it', () => {
    const { marks } = laid(DOT);
    const group = marks.find((m) => m.id === 'g:cluster_team');
    assert.equal(group.kind, 'group');
    assert.equal(marks.find((m) => m.id === 'l:g:cluster_team').text, 'Team');
    const loan = marks.find((m) => m.id === 't:loan');
    assert.ok(loan.x >= group.x && loan.y >= group.y);
    assert.ok(loan.x + loan.width <= group.x + group.width && loan.y + loan.height <= group.y + group.height);
  });

  test('two links between the same things keep their own ids, and each names the things it joins', () => {
    const { marks } = laid(DOT);
    const links = marks.filter((m) => m.kind === 'link').map((m) => [m.id, m.from, m.to, m.curve]);
    assert.deepEqual(links, [
      ['e:["loan","borrower"]#0', 'loan', 'borrower', true],
      ['e:["loan","borrower"]#1', 'loan', 'borrower', true],
      ['e:["borrower","rate"]#0', 'borrower', 'rate', true],
    ]);
    assert.equal(marks.find((m) => m.id === 'l:e:["loan","borrower"]#0').text, 'owes');
  });

  test('each arrowhead points along its link, at the end it is drawn at', () => {
    const { marks } = laid(DOT);
    const heads = marks.filter((m) => m.kind === 'arrowhead').map((m) => m.id);
    assert.deepEqual(heads, [
      'head:e:["loan","borrower"]#0',
      'head:e:["loan","borrower"]#1',
      'head:e:["borrower","rate"]#0',
      'tail:e:["borrower","rate"]#0',
    ]);
    // laid out left to right, so the heads point right and the tail of the two-way link points left
    const angle = (id) => marks.find((m) => m.id === id).angle;
    assert.ok(Math.abs(angle('head:e:["loan","borrower"]#1')) < 30);
    assert.ok(Math.abs(Math.abs(angle('tail:e:["borrower","rate"]#0')) - 180) < 30);
  });

  test('marks count from the top in CSS pixels, so the drawing fills its space as Graphviz drew it', () => {
    const json = viz.renderJSON('digraph { "a" -> "b"; }');
    const { space, marks } = layoutMarks(json);
    const [, , w, h] = json.bb.split(',').map(Number);
    assert.deepEqual(space, { width: (w * 4) / 3, height: (h * 4) / 3 });
    const a = marks.find((m) => m.id === 't:a'),
      b = marks.find((m) => m.id === 't:b');
    assert.ok(a.y < b.y, 'the first thing is on top, as Graphviz draws it down the page');
    const bounds = marksBounds(marks.filter((m) => m.kind === 'box'));
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= space.width + 0.01);
  });

  test('no key can give another mark its id, and a label of several lines is named whole', () => {
    // keys that look like the ids of other marks: a thing's label, a link and its arrowhead
    const dot = `digraph { "loan" [label="Loan\\nterms"]; "l:t:loan"; "a>b#0"; "a" -> "b"; "loan" -> "a>b#0"; }`;
    const { space, marks } = laid(dot);
    assert.ok(Array.isArray(drawMarksOf(marks, space)), drawMarksOf(marks, space));
    assert.equal(marks.find((m) => m.id === 't:loan').name, 'Loan terms');
    assert.deepEqual(
      marks.filter((m) => m.of === 'loan' && m.kind === 'label').map((m) => [m.id, m.text]),
      [
        ['l:t:loan', 'Loan'],
        ['l1:t:loan', 'terms'],
      ],
    );
  });
  test('a link drawn invisible is left out, with its arrowhead and label, and the next link keeps its id', () => {
    const dot = 'digraph { "a" -> "b" [style=invis, label="hidden"]; "a" -> "b"; }';
    const { marks } = laid(dot);
    const parts = marks.filter((m) => m.of === JSON.stringify(['a', 'b'])).map((m) => m.id);
    assert.deepEqual(parts, ['e:["a","b"]#1', 'head:e:["a","b"]#1']);
  });
});
