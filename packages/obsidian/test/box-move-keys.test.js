// Moving a box from the keyboard (editor spec §6, move_box_keyboard). M on a box picks it up. It says the first place
// it could go and the nudge that writes it. The arrow keys step through the places. Enter writes the nudge shown and
// says so, and Escape puts the box down and writes nothing. A Move choice in a box's details does the same, for a person with
// no keyboard to hand or who does not know M.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, settled, until } from './host/load-plugin.js';
import { PATH, TEAM, card, noteOf } from './host/drag-steps.js';

before(() => build());

const key = (target, k) => ({ key: k, target });

describe('moving a box from the keyboard', () => {
  // proves: move_box_keyboard
  test('M picks the box up and says where it would go, the arrows step through the places, and Enter writes it', async () => {
    const { env, el, vp, boxOf } = await card(noteOf(TEAM));
    try {
      const ann = boxOf('ann');
      assert.ok(vp.dispatch('keydown', key(ann, 'm')).defaultPrevented, 'M is taken');
      assert.ok(ann.classList.contains('is-held'), 'picked up');
      const hint = el.querySelector('.thoughtknot-move-hint');
      assert.equal(hint.getAttribute('role'), 'status', 'said to a screen reader too');
      const first = hint.textContent;
      assert.match(first, /^Put Ann (beside|before|after) (Bob|Cy) \(1 of \d+\)/);
      assert.equal(el.querySelectorAll('g.node.is-landing').length, 1, 'the box it would go by is marked');
      assert.ok(vp.dispatch('keydown', key(ann, 'ArrowRight')).defaultPrevented, 'the arrows step, and walk nothing');
      assert.match(hint.textContent, /\(2 of \d+\)/);
      assert.notEqual(hint.textContent, first);
      vp.dispatch('keydown', key(ann, 'ArrowLeft'));
      assert.equal(hint.textContent, first, 'and back');
      const said = /^(Put Ann \w+ \w+)/.exec(first)[1];
      assert.ok(vp.dispatch('keydown', key(ann, 'Enter')).defaultPrevented);
      await until(() => /:Nudge /.test(env.state.files.get(PATH)));
      await settled();
      assert.equal(env.state.notices.at(-1), `Moved: ${said}`);
      assert.ok(!ann.classList.contains('is-held'), 'put down');
      assert.equal(hint.hidden, true);
      assert.equal(el.querySelector('.thoughtknot-details').hidden, true, 'Enter moved it, and opened nothing');
    } finally {
      env.uninstall();
    }
  });

  // proves: move_box_keyboard
  test('Escape puts the box down and writes nothing', async () => {
    const { env, el, vp, boxOf, writes } = await card(noteOf(TEAM));
    try {
      const bob = boxOf('bob');
      vp.dispatch('keydown', key(bob, 'M'));
      vp.dispatch('keydown', key(bob, 'ArrowDown'));
      assert.ok(vp.dispatch('keydown', key(bob, 'Escape')).defaultPrevented);
      assert.ok(!bob.classList.contains('is-held'));
      assert.equal(el.querySelector('.thoughtknot-move-hint').hidden, true);
      assert.equal(el.querySelectorAll('g.node.is-landing').length, 0);
      vp.dispatch('keydown', key(bob, 'Enter'));
      assert.deepEqual(writes, [], 'nothing written: the Enter after only opens the box');
    } finally {
      env.uninstall();
    }
  });

  // proves: move_box_keyboard
  test('Move in a box’s details picks it up as M does, its box given the focus for the keys that follow', async () => {
    const { env, el, vp, boxOf } = await card(noteOf(TEAM));
    try {
      const cy = boxOf('cy');
      vp.dispatch('keydown', key(cy, 'Enter'));
      const move = el.querySelectorAll('.thoughtknot-details button').find((b) => b.textContent === 'Move…');
      assert.ok(move, 'offered in its details');
      move.click();
      assert.ok(cy.classList.contains('is-held'));
      assert.equal(env.doc.activeElement, cy);
      assert.match(el.querySelector('.thoughtknot-move-hint').textContent, /^Put Cy /);
      vp.dispatch('keydown', key(cy, 'Enter'));
      await until(() => /:Nudge /.test(env.state.files.get(PATH)));
      await settled();
    } finally {
      env.uninstall();
    }
  });
});
