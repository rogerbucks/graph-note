// Themes live in a graph of their own (editor spec §36, theme_graph). A theme that extends another falls back to it
// for what it does not set, and the knowledge never holds a theme.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { drawWith, knowledgeOf, themeChain, themeRules } from '../src/theme-graph.ts';
import { KNOWLEDGE, THEMES, worldOf } from './theme-fixtures.js';

test('drawing with a theme that depends on another falls back to the other for unset rules, and no theme node appears in a knowledge query', () => {
  const world = worldOf(THEMES, KNOWLEDGE);
  assert.deepEqual(themeChain(world.themes, 'blue'), ['blue', 'base']);
  assert.deepEqual(drawWith(world.themes, 'blue', world.work), {
    ann: { fill: '#ccddff', outline: '#333333' },
  });
  const known = knowledgeOf(world);
  assert.deepEqual(Object.keys(known), ['work']);
  for (const g of Object.values(known))
    for (const [, [labels]] of g.nodes) assert.ok(!labels.has('Theme') && !labels.has('ThemeRule'));
});

test('a theme sets its own rules first, and several themes live side by side', () => {
  const { themes } = worldOf(THEMES);
  assert.deepEqual(
    themeRules(themes, 'green').map((r) => r.id),
    ['green_person', 'green_plan', 'base_outline'],
  );
  assert.deepEqual(themes.labelled('Theme'), ['base', 'blue', 'green']);
});

test('themes that extend each other in a loop are refused', () => {
  const looped = worldOf(`${THEMES},\n(base)-[:EXTENDS]->(blue)`).themes;
  assert.throws(() => themeChain(looped, 'blue'), /loop/);
  assert.ok(gs, 'the library read both');
});
