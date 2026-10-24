// The drawing follows the engine (editor spec §36, drawing_follows_engine). Each frame of a run is asked of the live
// graph, never played from a canned sequence. Scrubbing back asks the run's log for an earlier state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { RunAnimation, runFrame } from '../src/drawing-runs.ts';

const ORDER = `// graph: order
(p:Process {name: 'Order'}),
(r:Run {process: 'p'}),
(taken:State {name: 'Taken', initial: TRUE}),
(packed:State {name: 'Packed'}),
(shipped:State {name: 'Shipped'}),
(taken)-[:TRANSITION]->(packed),
(packed)-[:TRANSITION]->(shipped)`;
const graphOf = (text) => Object.values(gs.worldFromStore(gs.read([text])))[0];

test('a state change shows in the drawing at once, and scrubbing back shows the earlier states from history', () => {
  let live = graphOf(ORDER);
  live = gs.withEntries(live, 'r', gs.enterState(live, 'r', 'taken'));
  const drawing = new RunAnimation(() => live, 'r');
  assert.deepEqual(drawing.now().states, ['taken']);
  // the engine moves the run on: the next frame asks and sees it, with nothing told to the drawing
  live = gs.withEntries(live, 'r', gs.moveRun(live, 'r', 'taken', 'packed'));
  assert.deepEqual(drawing.now(), { seq: 3, states: ['packed'], entered: 'packed' });
  live = gs.withEntries(live, 'r', gs.moveRun(live, 'r', 'packed', 'shipped'));
  assert.deepEqual(drawing.now().states, ['shipped']);
  assert.deepEqual(drawing.stops(), [1, 2, 3, 4, 5]);
  assert.deepEqual(drawing.at(1).states, ['taken'], 'scrubbed back to the start, from the log');
  assert.deepEqual(drawing.at(3).states, ['packed']);
  assert.deepEqual(drawing.now().states, ['shipped'], 'and the present is still the graph’s');
});

test('a frame before the first entry is empty', () => {
  assert.deepEqual(runFrame(graphOf(ORDER), 'r'), { seq: 0, states: [], entered: null });
});
