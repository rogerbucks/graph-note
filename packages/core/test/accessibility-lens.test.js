// Accessibility as queryable constraints (editor spec §36). Each WCAG constraint is a thing in the graph mesh. A lens
// flags each drawn element that fails one (accessibility_queryable). Every recorded constraint has a lens that checks
// it (accessibility_lenses_run).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import {
  ACCESSIBILITY_LENSES,
  WCAG_CONSTRAINTS,
  accessibilityLens,
  constraintsOf,
  uncheckable,
} from '../src/accessibility-lens.ts';

const graphOf = (text) => Object.values(gs.worldFromStore(gs.read([text])))[0];
const MESH = graphOf(WCAG_CONSTRAINTS);

test('the accessibility lens flags a low-contrast element and an element without a focus indicator', () => {
  const elements = [
    { key: 'ann', background: '#ffffff', text: '#222222', line: '#555555', focusable: true, focusRing: true },
    { key: 'pale', background: '#ffffff', text: '#bbbbbb', line: '#555555', focusable: true, focusRing: true },
    { key: 'ringless', background: '#ffffff', text: '#222222', line: '#555555', focusable: true, focusRing: false },
  ];
  assert.deepEqual(accessibilityLens(elements, constraintsOf(MESH)), [
    { key: 'pale', constraint: 'wcag_1_4_3', criterion: '1.4.3', why: 'contrast', ratio: 1.92 },
    { key: 'ringless', constraint: 'wcag_2_4_7', criterion: '2.4.7', why: 'no-focus-ring' },
  ]);
});

test('the constraints are things a query can find, with their least values', () => {
  assert.deepEqual(MESH.labelled('WcagConstraint'), ['wcag_1_4_3', 'wcag_1_4_11', 'wcag_2_4_7']);
  assert.equal(constraintsOf(MESH).find((c) => c.criterion === '1.4.11').least, 3);
});

test('each recorded WCAG constraint has a lens that checks it', () => {
  const recorded = constraintsOf(MESH);
  assert.deepEqual(uncheckable(recorded), []);
  for (const c of recorded) assert.equal(typeof ACCESSIBILITY_LENSES[c.check], 'function', c.criterion);
  const odd = constraintsOf(graphOf("// graph: a\n(w:WcagConstraint {criterion: '1.4.12', check: 'text-spacing'})"));
  assert.deepEqual(
    uncheckable(odd).map((c) => c.criterion),
    ['1.4.12'],
    'one with no lens is listed, never passed quietly',
  );
});
