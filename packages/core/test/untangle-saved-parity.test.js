// untangle_legend (editor spec §25), read alike by both libraries (§12): the legend's choices a view was saved as shown
// with are read the same by the Python library as by the core — the same problems reading each style, the same choices
// for the view, and the same things and links brought forward and hidden in the drawing. The cases are shared with
// python/graph_spec/tests/test_legend.py, whose Python answer (python_answer: read_style, and legend_layers over the
// parts graph_svg draws) is run here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { styleOf } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { edgesOf } from '../src/focus.ts';
import { readStyle } from '../src/style.ts';
import { LegendFilter } from '../src/untangle.ts';

const { cases: CASES } = JSON.parse(
  readFileSync(new URL('../../../python/graph_spec/tests/legend_cases.json', import.meta.url), 'utf8'),
);
const PY_TESTS = fileURLToPath(new URL('../../../python/graph_spec/tests', import.meta.url));
const PYTHON = `
import json, sys
sys.path.insert(0, ${JSON.stringify(PY_TESTS)})
from test_legend import python_answer
print(json.dumps([python_answer(texts, view) for texts, view in json.load(sys.stdin)]))
`;

const row = (p) => [p.block, p.line, p.severity, p.message, p.fix];
const kept = (k) => ({ things: [...k.things].sort(), edges: [...k.edges].sort((a, b) => a - b) });

/** The core's answer for a note and the view whose Shown is read, as the plugin reads a view saved as shown. */
function coreAnswer(texts, view) {
  const reading = readNote(texts),
    styles = {},
    legend = {};
  for (const t of texts) {
    const g = styleOf(t);
    if (g !== null && !(g in styles)) styles[g] = readStyle(texts, g, reading).problems.map(row);
  }
  for (const [graph, drawing] of reading.graphs) {
    const choices = readStyle(texts, graph, reading).style.shown.get(view)?.legend ?? null;
    const filter = new LegendFilter();
    filter.restore(choices ?? []);
    const { forward, hidden } = filter.apply(drawing, edgesOf(drawing));
    legend[graph] = { choices, layers: { forward: forward && kept(forward), hidden: kept(hidden) } };
  }
  return { styles, legend };
}

test('the legend’s choices saved with a view are read alike by both, and come to the same in the drawing', () => {
  const notes = CASES.map((c) => [c.blocks.map((lines) => lines.join('\n')), c.view]);
  const r = spawnSync('python3', ['-c', PYTHON], { input: JSON.stringify(notes), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const python = JSON.parse(r.stdout);
  CASES.forEach((c, n) => assert.deepEqual(python[n], coreAnswer(...notes[n]), c.name));
});

test('the cases show what they say: choices kept, faults reported, and something forward and hidden', () => {
  const answers = CASES.map((c) => coreAnswer(...[c.blocks.map((lines) => lines.join('\n')), c.view]));
  assert.deepEqual(answers[0].legend.town.choices, [
    { id: 'kind:Person', state: 'forward' },
    { id: 'type:NEAR', state: 'hidden' },
  ]);
  assert.deepEqual(answers[0].legend.town.layers, {
    forward: { things: ['ann', 'bob'], edges: [0] },
    hidden: { things: [], edges: [2] },
  });
  assert.equal(answers[3].styles.trip.length, 8, JSON.stringify(answers[3].styles.trip));
  assert.deepEqual(answers[3].legend.trip.choices, [{ id: 'kind:Place', state: 'hidden' }]);
  assert.equal(answers[5].legend.trip.choices, null);
  assert.equal(answers[5].legend.trip.layers.forward, null);
});
