// links_show_flow, flow_in_style_graph and motion_not_alone (editor spec §7), drawn alike by both renderers (§12): a
// graph's style graph moves its links, and graph_svg.py draws it as the core does — the same problems reading each style,
// the same links moving and how, and the source of each direction laid out, byte for byte. The cases are shared with
// python/graph_spec/tests/test_graph_svg_flow.py, whose Python answer (python_answer: read_style, and the sources
// graph_svg.render hands Graphviz from render_args) is run here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { styleOf } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { directions } from '../src/render.ts';
import { readStyle } from '../src/style.ts';
import { styledDrawing } from '../src/style-source.ts';

const { cases: FLOWING } = JSON.parse(
  readFileSync(new URL('../../../python/graph_spec/tests/flow_cases.json', import.meta.url), 'utf8'),
);
const PY_TESTS = fileURLToPath(new URL('../../../python/graph_spec/tests', import.meta.url));
const PYTHON = `
import json, sys
sys.path.insert(0, ${JSON.stringify(PY_TESTS)})
from test_graph_svg_flow import python_answer
print(json.dumps([python_answer(texts, view) for texts, view in json.load(sys.stdin)]))
`;

test('links moved by a Flow are drawn the same by both, byte for byte', () => {
  const notes = FLOWING.map((c) => [c.blocks.map((lines) => lines.join('\n')), c.view ?? null]);
  const r = spawnSync('python3', ['-c', PYTHON], { input: JSON.stringify(notes), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const python = JSON.parse(r.stdout);
  const row = (p) => [p.block, p.line, p.severity, p.message, p.fix];
  FLOWING.forEach((c, n) => {
    const [texts, view] = notes[n];
    const reading = readNote(texts),
      styles = {},
      drawn = {},
      flow = {};
    for (const t of texts) {
      const g = styleOf(t);
      if (g !== null && !(g in styles)) styles[g] = readStyle(texts, g, reading).problems.map(row);
    }
    for (const [graph, drawing] of reading.graphs) {
      // as the plugin draws a graph or a view (packages/obsidian/src/block.ts, view-block.ts): styled for its view
      const { style } = readStyle(texts, graph, reading);
      const styled = styledDrawing(drawing, style, reading.world[graph], view ?? undefined);
      drawn[graph] = Object.fromEntries(directions(styled).map((d) => [d.rankdir, d.dot]));
      flow[graph] = (styled.flow ?? []).map((f) => [f.index, f.motion, f.means]);
    }
    assert.deepEqual(python[n], { styles, drawn, flow }, c.name);
  });
  const sources = python.flatMap((p) => Object.values(p.drawn).flatMap((d) => Object.values(d)));
  assert.ok(
    sources.some((s) => s.includes('thoughtknot-flow-dot') && s.includes('style=dashed')),
    'dots and dashes move',
  );
});
