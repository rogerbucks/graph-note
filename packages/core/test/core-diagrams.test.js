// The built-in diagram types through the plug-in interface (editor spec §43, plugin_interface; §15). These prove each
// one registers as a plug-in's type does, holds to the same contract, and gives back drawing marks for a graph's shape.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pluginRegistry } from '../src/plugins.ts';
import { diagramContract } from '../src/plugins-contract.ts';
import { CORE_DIAGRAMS_ID, coreDiagramType, coreDiagrams } from '../src/core-diagrams.ts';
import { drawMarksOf } from '../src/drawing-marks.ts';
import { loadEngine } from '../src/engine.ts';
import { DIAGRAM_TYPES } from '../src/style-graph.ts';

const engine = await loadEngine();
const SPACE = { width: 400, height: 300 };
const thing = (key, kind = 'Person') => ({ key, text: key.toUpperCase(), kinds: [kind] });
/** A family tree: one parent of two, one of them parent of a third, and a team they sit in. */
const FAMILY = {
  things: [thing('ann'), thing('bob'), thing('cy'), thing('dee'), thing('lab', 'Team')],
  links: [
    { from: 'ann', type: 'PARENT_OF', to: 'bob' },
    { from: 'ann', type: 'PARENT_OF', to: 'cy' },
    { from: 'bob', type: 'PARENT_OF', to: 'dee' },
    { from: 'ann', type: 'PARENT_OF', to: 'lab' },
  ],
};
const registry = () => {
  const r = pluginRegistry({ timeLimit: Infinity });
  r.register(coreDiagrams(engine));
  return r;
};
const marksOf = async (type, shape = FAMILY, space = SPACE) => {
  const r = await registry().diagramMarks(coreDiagramType(type), shape, space);
  assert.ok(r.ok, r.message);
  return r.value;
};

describe('the built-in diagram types, through the plug-in interface (plugin_interface)', () => {
  test('each built-in type is added through it, under the core’s own id, with its title', () => {
    const r = registry();
    assert.deepEqual(r.plugins(), [CORE_DIAGRAMS_ID]);
    assert.deepEqual(
      r.diagramTypes().map((d) => [d.type, d.title]),
      DIAGRAM_TYPES.map((t) => [`thoughtknot.diagrams.${t}`, t[0].toUpperCase() + t.slice(1)]),
    );
  });

  test('each holds to the contract every plug-in’s diagram type is held to', async () => {
    for (const d of registry().diagramTypes())
      for (const check of diagramContract(d, CORE_DIAGRAMS_ID)) await check.run();
  });

  test('a tree gives drawing marks: a box for each thing and a link for each link, named by their keys', async () => {
    const marks = await marksOf('tree');
    assert.ok(Array.isArray(drawMarksOf(marks, SPACE)));
    const boxes = marks.filter((m) => m.kind === 'box' && m.role === 'thing').map((m) => m.of);
    assert.deepEqual(boxes.sort(), ['ann', 'bob', 'cy', 'dee', 'lab']);
    const links = marks.filter((m) => m.kind === 'link').map((m) => `${m.from}>${m.to}`);
    assert.deepEqual(links.sort(), ['ann>bob', 'ann>cy', 'ann>lab', 'bob>dee']);
    const y = (key) => marks.find((m) => m.kind === 'box' && m.of === key).y;
    assert.ok(y('ann') < y('bob') && y('bob') < y('dee'), 'a tree reads down, a parent above its children');
  });

  test('a type the graph does not fit is drawn as a network, never wrongly', async () => {
    const loop = { ...FAMILY, links: [...FAMILY.links, { from: 'dee', type: 'PARENT_OF', to: 'ann' }] };
    assert.deepEqual(await marksOf('flow', loop), await marksOf('network', loop));
    assert.notDeepEqual(await marksOf('flow'), await marksOf('network'), 'a flow it fits is drawn as a flow');
  });

  test('marks are shrunk to fit a small space, and never grown to fill a large one', async () => {
    const small = await marksOf('network', FAMILY, { width: 60, height: 40 });
    assert.ok(Array.isArray(drawMarksOf(small, { width: 60, height: 40 })));
    const large = await marksOf('network', FAMILY, { width: 4000, height: 3000 });
    assert.deepEqual(large, await marksOf('network', FAMILY, { width: 5000, height: 5000 }));
  });

  test('a table is a row for each thing, its text then its kinds', async () => {
    const marks = await marksOf('table');
    assert.deepEqual(
      marks.filter((m) => m.kind === 'label').map((m) => m.text),
      ['ANN', 'Person', 'BOB', 'Person', 'CY', 'Person', 'DEE', 'Person', 'LAB', 'Team'],
    );
    assert.deepEqual(
      marks.filter((m) => m.kind === 'box').map((m) => m.style),
      ['kind.0', 'kind.0', 'kind.0', 'kind.0', 'kind.1'],
    );
  });

  test('drawn as SVG, the marks are coloured in the host’s theme, with no stand-in colour left', async () => {
    const r = await registry().drawDiagram(coreDiagramType('tree'), FAMILY, SPACE);
    assert.ok(r.ok, r.message);
    assert.match(r.value, /<svg /);
    assert.doesNotMatch(r.value, /#000[0-5][0-9a-f]{2}/);
    assert.match(r.value, />ANN</);
  });
});
