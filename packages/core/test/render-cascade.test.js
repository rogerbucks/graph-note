// The drawing's inputs kept apart and cascaded (editor spec §36, render_cascade): central defaults, then the view's,
// then the graph's own, the later winning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cascadeLook, splitLooks } from '../src/render-cascade.ts';

const CENTRAL = { '*': { colour: 'grey', shape: 'box' }, 'kind:Person': { colour: 'blue' } };
const VIEW = { 'kind:Person': { colour: 'green' } };

test("a graph's own colour override beats the view's and the central default", () => {
  const ann = { id: 'ann', kinds: ['Person'] };
  const own = { ann: { colour: 'red' } };
  assert.deepEqual(cascadeLook(ann, { central: CENTRAL }).look, { colour: 'blue', shape: 'box' });
  assert.deepEqual(cascadeLook(ann, { central: CENTRAL, view: VIEW }).look, { colour: 'green', shape: 'box' });
  assert.deepEqual(cascadeLook(ann, { central: CENTRAL, view: VIEW, own }), {
    look: { colour: 'red', shape: 'box' },
    from: { colour: 'own', shape: 'central' },
  });
});

test('the structure holds no look: look properties come out as the graph’s own layer', () => {
  assert.deepEqual(splitLooks({ ann: { name: 'Ann', colour: 'red' } }), {
    structure: { ann: { name: 'Ann' } },
    own: { ann: { colour: 'red' } },
  });
});
