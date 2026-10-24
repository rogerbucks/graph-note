// Earlier drawings stay reviewable (editor spec §36, drawing_history_diffs). A redraw replaces the drawing, the one
// before stays in the history, and a difference is said in things, links and theme rules, never pixels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DrawingHistory, drawingDiff } from '../src/drawing-history.ts';
import { themeRules } from '../src/theme-graph.ts';
import { KNOWLEDGE, THEMES, worldOf } from './theme-fixtures.js';

test('after a broken theme, earlier drawings open from history and the difference lists the changed theme rules', () => {
  const good = worldOf(THEMES, KNOWLEDGE);
  const broken = worldOf(THEMES.replace("value: '#ccddff'", "value: '#ccddf'"), KNOWLEDGE);
  const history = new DrawingHistory();
  history.redraw({ svg: '<svg>good</svg>', graph: good.work, rules: themeRules(good.themes, 'blue') });
  history.redraw({ svg: '<svg>broken</svg>', graph: broken.work, rules: themeRules(broken.themes, 'blue') });
  assert.equal(history.current.svg, '<svg>broken</svg>', 'the redraw replaced the drawing');
  assert.equal(history.open(1).svg, '<svg>good</svg>', 'the one before opens from history');
  assert.deepEqual(history.diffSince(1), {
    things: { added: [], removed: [] },
    links: { added: [], removed: [] },
    rules: { added: [], removed: [], changed: ['blue_person'] },
  });
});

test('a difference names the things and links that came and went', () => {
  const a = worldOf(KNOWLEDGE).work;
  const b = worldOf(`${KNOWLEDGE},\n(bob:Person {name: 'Bob'}),\n(bob)-[:OWNS]->(plan)`).work;
  const diff = drawingDiff({ svg: '', graph: a, rules: [] }, { svg: '', graph: b, rules: [] });
  assert.deepEqual(diff.things, { added: ['bob'], removed: [] });
  assert.deepEqual(diff.links, { added: ['bob-OWNS->plan'], removed: [] });
});

test('the history keeps a bounded number of drawings, the oldest going first', () => {
  const g = worldOf(KNOWLEDGE).work;
  const h = new DrawingHistory(2);
  for (const svg of ['1', '2', '3']) h.redraw({ svg, graph: g, rules: [] });
  assert.equal(h.length, 2);
  assert.equal(h.open(1).svg, '2');
  assert.equal(h.open(2), null);
});
