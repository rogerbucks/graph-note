// Graphviz's layout read as drawing marks alike by both libraries (editor spec §43, plugin_interface; §12). Each case
// is laid out once, as JSON. The core reads it (layoutMarks) and so does the Python library (graphspec/style/marks.py,
// layout_marks). Both give the same marks, ids, parts and order, and the same room round the drawing. Numbers agree to
// a billionth: the two languages may round the last digit of a square root apart. The cases are shared with
// python/graph_spec/tests/test_marks.py.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { instance } from '@viz-js/viz';
import { layoutMarks } from '../src/graphviz-marks.ts';

const { cases: CASES } = JSON.parse(
  readFileSync(new URL('../../../python/graph_spec/tests/marks_cases.json', import.meta.url), 'utf8'),
);
const PY_SRC = fileURLToPath(new URL('../../../python/graph_spec/src', import.meta.url));
const PYTHON = `
import json, sys
sys.path.insert(0, ${JSON.stringify(PY_SRC)})
from graphspec.style.marks import layout_marks
print(json.dumps([layout_marks(g) for g in json.load(sys.stdin)]))
`;

/** Where `a` and `b` first differ, numbers to a billionth; or null where they agree. */
function apart(a, b, at = '') {
  if (typeof a === 'number' && typeof b === 'number')
    return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a)) ? null : `${at}: ${a} and ${b}`;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${at}: ${a.length} and ${b.length} items`;
    for (const [i, x] of a.entries()) {
      const why = apart(x, b[i], `${at}[${i}]`);
      if (why) return why;
    }
    return null;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const k of keys) {
      const why = apart(a[k], b[k], `${at}.${k}`);
      if (why) return why;
    }
    return null;
  }
  return a === b ? null : `${at}: ${JSON.stringify(a)} and ${JSON.stringify(b)}`;
}

test('both libraries read the same layout as the same marks, part for part and number for number', async () => {
  const viz = await instance();
  const layouts = CASES.map((c) => viz.renderJSON(c.dot));
  const r = spawnSync('python3', ['-c', PYTHON], { input: JSON.stringify(layouts), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const python = JSON.parse(r.stdout);
  CASES.forEach((c, i) => assert.equal(apart(layoutMarks(layouts[i]), python[i]), null, c.name));
});
