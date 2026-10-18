// Moving a box by dragging it (editor spec §6, nudge_preview, drag_moves_box):
// - A box pressed with a mouse and dragged follows the pointer.
// - The box it would land by is marked, and a line says the nudge it would write.
// - Letting go writes that nudge into the style graph and says so.
// - Escape, or letting go away from every box, writes nothing.
// - A press that hardly moves is still a tap. A drag across empty space still pans.
// - A finger swiped across a box moves nothing.
// And with a finger (hold_to_drag_touch):
// - Held on a box for a moment it picks the box up. Only then does a drag move it.
// - A hold lifted without moving is the long press it was.
// - While a box is picked up the page does not scroll.
// In a radial drawing (radial_spoke_order), a box let go by a thing around the centre goes just before or after it.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { PATH, TEAM, card, mouse, noteOf, touch } from './host/drag-steps.js';
import { clock } from './host/quick-info-steps.js';

before(() => build());

describe('dragging a box with a mouse', () => {
  // proves: nudge_preview, drag_moves_box
  test('shows where it would land and the nudge it would write, and writes it when let go', async () => {
    const { env, el, vp, boxOf, placeOf, besideOf, at } = await card(noteOf(TEAM));
    try {
      const ann = boxOf('ann'),
        start = at(placeOf('ann').x, placeOf('ann').y),
        drop = besideOf('cy');
      vp.dispatch('pointerdown', mouse(1, ann, start));
      vp.dispatch('pointermove', mouse(1, vp, drop));
      assert.ok(ann.getAttribute('transform')?.startsWith('translate('), 'the box follows the pointer');
      assert.ok(boxOf('cy').classList.contains('is-landing'), 'the box it would land by is marked');
      const hint = el.querySelector('.thoughtknot-move-hint');
      assert.equal(hint.hidden, false);
      assert.equal(hint.getAttribute('role'), 'status', 'said to a screen reader too');
      assert.equal(hint.textContent, 'Put Ann beside Cy');
      vp.dispatch('pointerup', mouse(1, vp, drop));
      await until(() => /:Nudge /.test(env.state.files.get(PATH)));
      const now = env.state.files.get(PATH);
      assert.ok(now.includes(fence(TEAM)), 'the data block untouched');
      assert.match(now, /STYLE team[\s\S]*\(nudge_1:Nudge \{word: 'beside', thing: 'ann', other: 'cy'\}\)/);
      assert.equal(env.state.notices.at(-1), 'Moved: Put Ann beside Cy');
      assert.equal(ann.getAttribute('transform'), null, 'the box is put back until the drawing is laid out again');
      assert.equal(el.querySelector('.thoughtknot-details').hidden, true, 'a drag is not a tap: nothing opens');
    } finally {
      env.uninstall();
    }
  });

  // proves: drag_moves_box
  test('Escape puts the box back and writes nothing', async () => {
    const note = noteOf(TEAM);
    const { env, el, vp, boxOf, placeOf, besideOf, at, writes } = await card(note);
    try {
      const ann = boxOf('ann');
      vp.dispatch('pointerdown', mouse(2, ann, at(placeOf('ann').x, placeOf('ann').y)));
      vp.dispatch('pointermove', mouse(2, vp, besideOf('cy')));
      assert.ok(vp.dispatch('keydown', { key: 'Escape' }).defaultPrevented);
      assert.equal(ann.getAttribute('transform'), null);
      assert.equal(el.querySelector('.thoughtknot-move-hint').hidden, true);
      vp.dispatch('pointerup', mouse(2, vp, besideOf('cy')));
      assert.deepEqual(writes, [], 'nothing written');
    } finally {
      env.uninstall();
    }
  });

  // proves: drag_moves_box
  test('let go away from every box, it lands nowhere, says so, and writes nothing', async () => {
    const note = noteOf(TEAM);
    const { env, el, vp, boxOf, placeOf, at, writes } = await card(note);
    try {
      const p = placeOf('ann'),
        far = at(p.x - p.w * 6, p.y - p.h * 6);
      vp.dispatch('pointerdown', mouse(3, boxOf('ann'), at(p.x, p.y)));
      vp.dispatch('pointermove', mouse(3, vp, far));
      assert.equal(el.querySelector('.thoughtknot-move-hint').textContent, 'Let go next to a box to place Ann by it');
      assert.equal(el.querySelectorAll('g.node.is-landing').length, 0);
      vp.dispatch('pointerup', mouse(3, vp, far));
      assert.deepEqual(writes, [], 'nothing written');
    } finally {
      env.uninstall();
    }
  });

  // proves: drag_moves_box
  test('a press that hardly moves is still a tap, which opens the box, and moves nothing', async () => {
    const note = noteOf(TEAM);
    const { env, el, vp, boxOf, placeOf, at, writes } = await card(note);
    try {
      const p = at(placeOf('bob').x, placeOf('bob').y);
      vp.dispatch('pointerdown', mouse(4, boxOf('bob'), p));
      vp.dispatch('pointermove', mouse(4, vp, { clientX: p.clientX + 3, clientY: p.clientY }));
      vp.dispatch('pointerup', mouse(4, boxOf('bob'), { clientX: p.clientX + 3, clientY: p.clientY }));
      assert.equal(boxOf('bob').getAttribute('transform'), null);
      assert.equal(el.querySelector('.thoughtknot-details').hidden, false, 'the tap opened its details');
      assert.deepEqual(writes, [], 'nothing written');
    } finally {
      env.uninstall();
    }
  });

  // proves: drag_moves_box
  test('a drag across empty space still pans the drawing', async () => {
    const { env, el, vp } = await card(noteOf(TEAM));
    try {
      const zoomIn = el.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === 'Zoom in');
      for (let i = 0; i < 4; i++) zoomIn.click();
      const x0 = vp.cssProps['--thoughtknot-x'],
        corner = { clientX: 698, clientY: 2 };
      vp.dispatch('pointerdown', mouse(5, vp, corner));
      const moved = vp.dispatch('pointermove', mouse(5, vp, { clientX: 600, clientY: 2 }));
      vp.dispatch('pointerup', mouse(5, vp, { clientX: 600, clientY: 2 }));
      assert.ok(moved.defaultPrevented, 'the drag was taken as a pan');
      assert.notEqual(vp.cssProps['--thoughtknot-x'], x0, 'panned');
      assert.equal(el.querySelectorAll('g.node[transform]').length, 0, 'no box moved');
    } finally {
      env.uninstall();
    }
  });

  // proves: drag_moves_box
  test('a finger on a box moves nothing: it scrolls the note or pans', async () => {
    const note = noteOf(TEAM);
    const { env, vp, boxOf, placeOf, besideOf, at, writes } = await card(note);
    try {
      vp.dispatch('pointerdown', touch(6, boxOf('ann'), at(placeOf('ann').x, placeOf('ann').y)));
      vp.dispatch('pointermove', touch(6, vp, besideOf('cy')));
      assert.equal(boxOf('ann').getAttribute('transform'), null);
      vp.dispatch('pointerup', touch(6, vp, besideOf('cy')));
      assert.deepEqual(writes, [], 'nothing written');
    } finally {
      env.uninstall();
    }
  });
});

describe('moving a box with a finger', () => {
  // proves: hold_to_drag_touch
  test('a finger held on a box picks it up, and a drag then moves it, written when let go', async () => {
    const { env, el, vp, boxOf, placeOf, besideOf, at, writes } = await card(noteOf(TEAM));
    try {
      const time = clock(env),
        ann = boxOf('ann');
      vp.dispatch('pointerdown', touch(1, ann, at(placeOf('ann').x, placeOf('ann').y)));
      assert.ok(!ann.classList.contains('is-held'), 'not at once: for a moment');
      time.fire();
      assert.ok(ann.classList.contains('is-held'), 'picked up');
      vp.dispatch('pointermove', touch(1, vp, besideOf('cy')));
      assert.ok(ann.getAttribute('transform')?.startsWith('translate('), 'the box follows the finger');
      assert.equal(el.querySelector('.thoughtknot-move-hint').textContent, 'Put Ann beside Cy');
      vp.dispatch('pointerup', touch(1, vp, besideOf('cy')));
      assert.deepEqual(writes, [PATH]);
      await until(() => /:Nudge /.test(env.state.files.get(PATH)));
      assert.match(env.state.files.get(PATH), /\(nudge_1:Nudge \{word: 'beside', thing: 'ann', other: 'cy'\}\)/);
      assert.ok(!ann.classList.contains('is-held'), 'put down');
      assert.equal(el.querySelector('.thoughtknot-details').hidden, true, 'nothing opens');
    } finally {
      env.uninstall();
    }
  });

  // proves: hold_to_drag_touch
  test('a swipe begun at once scrolls or pans, and moves nothing, even once the moment has passed', async () => {
    const { env, vp, boxOf, placeOf, besideOf, at, writes } = await card(noteOf(TEAM));
    try {
      const time = clock(env),
        ann = boxOf('ann');
      vp.dispatch('pointerdown', touch(2, ann, at(placeOf('ann').x, placeOf('ann').y)));
      vp.dispatch('pointermove', touch(2, vp, besideOf('cy')));
      time.fire();
      vp.dispatch('pointermove', touch(2, vp, besideOf('bob')));
      assert.ok(!ann.classList.contains('is-held'));
      assert.equal(ann.getAttribute('transform'), null);
      vp.dispatch('pointerup', touch(2, vp, besideOf('bob')));
      assert.deepEqual(writes, [], 'nothing written');
    } finally {
      env.uninstall();
    }
  });

  // proves: hold_to_drag_touch
  test('a hold lifted without moving is a long press, as before: no details open and nothing moves', async () => {
    const { env, el, vp, boxOf, placeOf, at, writes } = await card(noteOf(TEAM));
    try {
      const time = clock(env),
        ann = boxOf('ann'),
        p = at(placeOf('ann').x, placeOf('ann').y);
      vp.dispatch('pointerdown', touch(3, ann, p));
      time.fire();
      vp.dispatch('pointerup', touch(3, ann, p));
      assert.ok(!ann.classList.contains('is-held'), 'put down');
      assert.equal(el.querySelector('.thoughtknot-details').hidden, true);
      assert.deepEqual(writes, []);
    } finally {
      env.uninstall();
    }
  });

  // proves: hold_to_drag_touch
  test('while a box is picked up, the page under it does not scroll; otherwise it does', async () => {
    const { env, vp, boxOf, placeOf, at } = await card(noteOf(TEAM));
    try {
      const time = clock(env),
        ann = boxOf('ann');
      assert.equal(
        vp.dispatch('touchmove', { target: ann, touches: [{}] }).defaultPrevented,
        false,
        'nothing held: the page scrolls',
      );
      vp.dispatch('pointerdown', touch(4, ann, at(placeOf('ann').x, placeOf('ann').y)));
      time.fire();
      assert.equal(
        vp.dispatch('touchmove', { target: ann, touches: [{}] }).defaultPrevented,
        true,
        'held: the page stays',
      );
      vp.dispatch('pointercancel', touch(4, ann, {}));
      assert.ok(!ann.classList.contains('is-held'), 'a lost finger puts it down');
      assert.equal(vp.dispatch('touchmove', { target: ann, touches: [{}] }).defaultPrevented, false);
    } finally {
      env.uninstall();
    }
  });
});

describe('dragging a box in a radial drawing', () => {
  const HUB = `// graph: hub
(sun:Thing {name: 'Sun'}),
(a:Thing {name: 'A'}),
(b:Thing {name: 'B'}),
(c:Thing {name: 'C'}),
(d:Thing {name: 'D'}),
(sun)-[:SEES]->(a),
(sun)-[:SEES]->(b),
(sun)-[:SEES]->(c),
(sun)-[:SEES]->(d)`;
  const ROUND = "// graph: hub_style · STYLE hub\n(d1:Diagram {type: 'radial'})";

  // proves: radial_spoke_order
  test('a box let go just clockwise of another around the centre goes just before it, written as a before nudge', async () => {
    const { env, el, vp, boxOf, placeOf, at } = await card(noteOf(HUB, ROUND));
    try {
      const hub = placeOf('sun'),
        a = placeOf('a'),
        c = placeOf('c');
      // a little further round than A, clockwise as drawn (the drawing's y runs down the page)
      const angle = Math.atan2(a.y - hub.y, a.x - hub.x) + 0.2,
        far = Math.hypot(a.x - hub.x, a.y - hub.y),
        drop = at(hub.x + far * Math.cos(angle), hub.y + far * Math.sin(angle));
      vp.dispatch('pointerdown', mouse(1, boxOf('c'), at(c.x, c.y)));
      vp.dispatch('pointermove', mouse(1, vp, drop));
      assert.equal(el.querySelector('.thoughtknot-move-hint').textContent, 'Put C before A');
      vp.dispatch('pointerup', mouse(1, vp, drop));
      await until(() => /:Nudge /.test(env.state.files.get(PATH)));
      assert.match(env.state.files.get(PATH), /\(nudge_1:Nudge \{word: 'before', thing: 'c', other: 'a'\}\)/);
    } finally {
      env.uninstall();
    }
  });
});
