// animated_image_shown (editor spec §18), drawn alike by both renderers (§12): where a graph's style graph asks, a
// thing's image is drawn on its box, and graph_svg.py keeps the same room for it as the core — the same problems reading
// each style, the same boxes drawn with a picture, and the source of each direction laid out, byte for byte. The cases
// are shared with python/graph_spec/tests/test_graph_svg_picture.py, whose Python answer (python_answer: read_style, and
// the sources graph_svg.render hands Graphviz from render_args) is run here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { styleOf } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { PICTURE_MARK } from '../src/picture.ts';
import { directions } from '../src/render.ts';
import { readStyle } from '../src/style.ts';
import { styledDrawing } from '../src/style-source.ts';

const { cases: PICTURED } = JSON.parse(
  readFileSync(new URL('../../../python/graph_spec/tests/picture_cases.json', import.meta.url), 'utf8'),
);
const PY_TESTS = fileURLToPath(new URL('../../../python/graph_spec/tests', import.meta.url));
const PYTHON = `
import json, sys
sys.path.insert(0, ${JSON.stringify(PY_TESTS)})
from test_graph_svg_picture import python_answer
print(json.dumps([python_answer(texts, view) for texts, view in json.load(sys.stdin)]))
`;

test('room for a picture on a box is kept the same by both, byte for byte', () => {
  const notes = PICTURED.map((c) => [c.blocks.map((lines) => lines.join('\n')), c.view ?? null]);
  const r = spawnSync('python3', ['-c', PYTHON], { input: JSON.stringify(notes), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const python = JSON.parse(r.stdout);
  const row = (p) => [p.block, p.line, p.severity, p.message, p.fix];
  PICTURED.forEach((c, n) => {
    const [texts, view] = notes[n];
    const reading = readNote(texts),
      styles = {},
      drawn = {},
      pictures = {};
    for (const t of texts) {
      const g = styleOf(t);
      if (g !== null && !(g in styles)) styles[g] = readStyle(texts, g, reading).problems.map(row);
    }
    for (const [graph, drawing] of reading.graphs) {
      // as the plugin draws a graph or a view (packages/obsidian/src/block.ts, view-block.ts): styled for its view
      const { style } = readStyle(texts, graph, reading);
      const styled = styledDrawing(drawing, style, reading.world[graph], view ?? undefined);
      drawn[graph] = Object.fromEntries(directions(styled).map((d) => [d.rankdir, d.dot]));
      pictures[graph] = (styled.pictures ?? []).map((p) => [p.index, p.key, p.property, p.value]);
    }
    assert.deepEqual(python[n], { styles, drawn, pictures }, c.name);
  });
  const sources = python.flatMap((p) => Object.values(p.drawn).flatMap((d) => Object.values(d)));
  assert.ok(
    sources.every((s) => s.includes(PICTURE_MARK)),
    'room is kept in every case',
  );
});
