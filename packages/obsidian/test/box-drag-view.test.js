// Moving a box by dragging it (editor spec §6, nudge_preview, drag_moves_box): a box pressed with a mouse and dragged
// follows the pointer, the box it would land by is marked and a line says the nudge it would write; letting go writes
// that nudge into the style graph and says so; Escape, or letting go away from every box, writes nothing; a press that
// hardly moves is still a tap; a drag across empty space still pans; and a finger on a box moves nothing.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
const TEAM = `// graph: team
(ann:Person {name: 'Ann'}),
(bob:Person {name: 'Bob'}),
(cy:Person {name: 'Cy'}),
(ann)-[:ASKS]->(bob),
(bob)-[:ASKS]->(cy)`;
const noteOf = (...blocks) => ['# Team', '', ...blocks.flatMap((b) => [fence(b), '']), ''].join('\n');

/** Shows the note's first block at PATH, with the drawing it was laid out as and a way to point at its boxes. */
async function card(note, options = {}) {
  const env = await load({ files: { [PATH]: note }, ...options });
  let drawn = null;
  const layout = env.plugin.layout.bind(env.plugin);
  env.plugin.layout = async (drawing, owner) => (drawn = await layout(drawing, owner));
  // each write to a note, counted as it is asked for, so a test can say none was asked for without waiting
  const writes = [],
    process = env.plugin.app.vault.process.bind(env.plugin.app.vault);
  env.plugin.app.vault.process = (file, f) => (writes.push(file.path), process(file, f));
  const { el } = await show(env, note);
  const { hitAreas } = await import('../../core/src/hits.ts');
  const areas = hitAreas(drawn.svg);
  const vp = el.querySelector('.graph-note-viewport'),
    svg = el.querySelector('svg.graph-note-svg');
  /** A point in the drawing's own units, as the viewport's pixels. */
  const at = (x, y) => {
    const vb = areas.viewBox,
      w = Number(svg.getAttribute('width')),
      h = Number(svg.getAttribute('height'));
    return {
      clientX: parseFloat(vp.cssProps['--graph-note-x']) + ((x - vb.x) * w) / vb.width,
      clientY: parseFloat(vp.cssProps['--graph-note-y']) + ((y - vb.y) * h) / vb.height,
    };
  };
  const boxOf = (key) => el.querySelectorAll('g.node').find((g) => g.getAttribute('data-key') === key);
  /** A box's middle and size, in the drawing's own units. */
  const placeOf = (key) => {
    const s = areas.shapes.find((x) => x.id === boxOf(key).getAttribute('id'));
    const xs = s.polygons.flat().map(([x]) => x),
      ys = s.polygons.flat().map(([, y]) => y);
    const [l, t, r, b] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    return { x: (l + r) / 2, y: (t + b) / 2, w: r - l, h: b - t };
  };
  /** The point just across the ranks from a box: beside it, for the direction the drawing was laid out in. */
  const besideOf = (key) => {
    const p = placeOf(key);
    return drawn.rankdir === 'TB' ? at(p.x + p.w * 0.8, p.y) : at(p.x, p.y + p.h * 0.8);
  };
  return { env, el, vp, at, boxOf, placeOf, besideOf, writes };
}

const mouse = (id, target, p) => ({ pointerId: id, pointerType: 'mouse', button: 0, target, ...p });

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
      const hint = el.querySelector('.graph-note-move-hint');
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
      assert.equal(el.querySelector('.graph-note-details').hidden, true, 'a drag is not a tap: nothing opens');
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
      assert.equal(el.querySelector('.graph-note-move-hint').hidden, true);
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
      assert.equal(el.querySelector('.graph-note-move-hint').textContent, 'Let go next to a box to place Ann by it');
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
      assert.equal(el.querySelector('.graph-note-details').hidden, false, 'the tap opened its details');
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
      const x0 = vp.cssProps['--graph-note-x'],
        corner = { clientX: 698, clientY: 2 };
      vp.dispatch('pointerdown', mouse(5, vp, corner));
      const moved = vp.dispatch('pointermove', mouse(5, vp, { clientX: 600, clientY: 2 }));
      vp.dispatch('pointerup', mouse(5, vp, { clientX: 600, clientY: 2 }));
      assert.ok(moved.defaultPrevented, 'the drag was taken as a pan');
      assert.notEqual(vp.cssProps['--graph-note-x'], x0, 'panned');
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
      const touch = (id, target, p) => ({ ...mouse(id, target, p), pointerType: 'touch' });
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
