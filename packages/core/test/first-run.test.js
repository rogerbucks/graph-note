// A first graph from an example (editor spec §44, first_run_help). A graph with nothing in it yet offers an example.
// The example is written after the block's own lines, so its graph line and schema stay. It reads with no problems and
// shows boxes and links of a few kinds. A short tour then says what to do, a step at a time, in the catalogue's words.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TOUR_STEPS, withExample } from '../src/first-run.ts';
import { readNote } from '../src/drawing.ts';
import { SOURCE_WORDS } from '../src/source-words.ts';

describe('a first graph from an example', () => {
  // proves: first_run_help
  test('keeps the block’s own lines, then adds the example, which reads with no problems', () => {
    const block = withExample('// graph: team');
    assert.ok(block.startsWith('// graph: team\n'), block);
    const reading = readNote([block]);
    assert.deepEqual(reading.problems, []);
    const drawing = reading.graphs.get('team');
    assert.ok(drawing.boxes.length >= 3, 'a few things');
    assert.ok(drawing.links.length >= 2, 'linked');
  });

  // proves: first_run_help
  test('is the same whatever was left after the graph line, such as blank lines', () => {
    assert.equal(withExample('// graph: team\n\n'), withExample('// graph: team'));
  });

  // proves: first_run_help
  test('has a short tour, each step in the catalogue’s words', () => {
    assert.ok(TOUR_STEPS.length >= 3 && TOUR_STEPS.length <= 5, 'short');
    for (const step of TOUR_STEPS) assert.equal(typeof SOURCE_WORDS[`tour.${step}`], 'string', step);
  });
});
