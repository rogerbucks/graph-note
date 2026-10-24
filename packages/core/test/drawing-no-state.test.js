// The drawing holds no state (editor spec §36, drawing_holds_no_state). The SVG is a picture and stores nothing. An
// event on it becomes a graph command for the engine, the only part that talks to persistence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { draw } from '../src/render.ts';
import { loadEngine } from '../src/engine.ts';
import { commandOf, routeEvent, stateInSvg } from '../src/drawing-commands.ts';

const NOTE = `// graph: g
(ann:Person {name: 'Ann'}),
(plan:Plan {name: 'The plan'}),
(ann)-[:OWNS]->(plan)`;

test('a click on a thing sends a graph command through the engine and the SVG holds no state', async () => {
  const engine = await loadEngine();
  const { svg } = draw(readNote([NOTE]).graphs.get('g'), engine);
  assert.deepEqual(stateInSvg(svg), [], 'the drawing is a picture, holding nothing');
  const sent = [];
  const command = routeEvent({ type: 'click', key: 'plan' }, { send: (c) => sent.push(c) });
  assert.deepEqual(command, { op: 'select', thing: 'plan' });
  assert.deepEqual(sent, [{ op: 'select', thing: 'plan' }], 'it went to the engine');
  assert.equal(draw(readNote([NOTE]).graphs.get('g'), engine).svg, svg, 'and the drawing kept nothing of it');
});

test('each event asks for its command, and the background clears', () => {
  assert.deepEqual(commandOf({ type: 'dblclick', key: 'ann' }), { op: 'open', thing: 'ann' });
  assert.deepEqual(commandOf({ type: 'keydown', key: 'ann', keyName: 'Enter' }), { op: 'open', thing: 'ann' });
  assert.deepEqual(commandOf({ type: 'keydown', key: 'ann', keyName: 'Delete' }), { op: 'remove', thing: 'ann' });
  assert.equal(commandOf({ type: 'keydown', key: 'ann', keyName: 'a' }), null);
  assert.deepEqual(commandOf({ type: 'click', key: null }), { op: 'clear' });
});

test('an SVG holding data, metadata, a script or a field is said to hold state', () => {
  const held = '<svg><metadata>x</metadata><script>1</script><g data-key="a" data-owner="ann"><input/></g></svg>';
  assert.deepEqual(stateInSvg(held), ['metadata', 'script', 'form field', 'attribute data-owner']);
});
