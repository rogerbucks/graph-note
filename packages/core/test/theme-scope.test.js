// A theme is chosen when the graph is drawn (editor spec §36, theme_links_meaningful). The graph names no theme; the
// scope picks one: a default, then an organisation's, a project's or the session's. A rule says which part it styles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { drawWith, themeFor, themeRuleProblems } from '../src/theme-graph.ts';
import { KNOWLEDGE, THEMES, worldOf } from './theme-fixtures.js';

const CHOICES = { default: 'base', organisation: { acme: 'blue', globex: 'green' } };

test("one graph drawn for two organisations uses each one's theme and the graph is unchanged", () => {
  const world = worldOf(THEMES, KNOWLEDGE);
  const before = gs.canon(world.work);
  const acme = drawWith(world.themes, themeFor(CHOICES, { organisation: 'acme' }), world.work);
  const globex = drawWith(world.themes, themeFor(CHOICES, { organisation: 'globex' }), world.work);
  assert.equal(acme.ann.fill, '#ccddff');
  assert.equal(globex.ann.fill, '#ccffcc');
  assert.deepEqual(globex.plan, { outline: '#006600' }, 'a rule for one thing styles the part it names');
  assert.equal(gs.canon(world.work), before, 'the graph is unchanged');
});

test('the narrowest choice wins: session, then project, then organisation, then the default', () => {
  const choices = { ...CHOICES, project: { launch: 'green' } };
  assert.equal(themeFor(choices, {}), 'base');
  assert.equal(themeFor(choices, { organisation: 'acme' }), 'blue');
  assert.equal(themeFor(choices, { organisation: 'acme', project: 'launch' }), 'green');
  assert.equal(themeFor({ ...choices, session: 'base' }, { organisation: 'acme', project: 'launch' }), 'base');
});

test('a rule that styles a thing without saying which part is a problem', () => {
  const { themes } = worldOf(`${THEMES},\n(vague:ThemeRule {thing: 'plan', value: '#000000'})`);
  assert.deepEqual(themeRuleProblems(themes), [{ rule: 'vague', why: 'no-part' }]);
});
