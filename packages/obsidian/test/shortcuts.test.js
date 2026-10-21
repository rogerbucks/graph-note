// Every keyboard shortcut in one place (editor spec §44, shortcuts_listed). ? on a drawing shows the list, and so does
// a command. The drawing's own commands are Obsidian commands too, with no keys of their own. So a person gives them
// keys in Obsidian's Hotkeys settings. Each acts on the drawing last used.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { load, GRAPH, show, svgOf } from './host/view-notes.js';

before(() => build());

const command = (env, id) => env.state.commands.find((c) => c.id === id);
/** Whether the command can run now, as Obsidian asks before it lists or runs it. */
const can = (env, id) => command(env, id).checkCallback(true);
const run = (env, id) => command(env, id).checkCallback(false);
const widthOf = (el) => Number(svgOf(el).getAttribute('width'));

/** The rows of a list of shortcuts: the keys, then what they do. */
const rowsOf = (el) =>
  el.querySelectorAll('.thoughtknot-shortcuts tr').map((tr) => tr.children.map((c) => c.textContent.trim()));

describe('the keyboard shortcuts are listed in one place', () => {
  // proves: shortcuts_listed
  test('? on a drawing shows the list; Escape closes it and gives the keyboard back', async () => {
    const env = await load();
    try {
      const { el } = await show(env, fence(GRAPH));
      const vp = el.querySelector('.thoughtknot-viewport');
      vp.focus();
      assert.ok(vp.dispatch('keydown', { key: '?', shiftKey: true }).defaultPrevented);
      const panel = el.querySelector('.thoughtknot-shortcuts');
      assert.ok(panel, 'the list is shown');
      assert.equal(panel.getAttribute('role'), 'dialog');
      assert.equal(panel.getAttribute('aria-label'), 'Keyboard shortcuts');
      const rows = rowsOf(el);
      assert.ok(
        rows.some(([keys, does]) => keys === '+ or =' && does === 'Zoom in'),
        JSON.stringify(rows),
      );
      assert.ok(
        rows.some(([keys]) => keys === 'Control+Space'),
        'the editor’s keys too',
      );
      assert.match(panel.textContent, /Hotkeys|hotkey/, 'and where to give a command keys of your own');
      panel.dispatch('keydown', { key: 'Escape' });
      assert.equal(el.querySelector('.thoughtknot-shortcuts'), null, 'closed');
      assert.equal(env.doc.activeElement, vp, 'the keyboard is back on the drawing');
    } finally {
      env.uninstall();
    }
  });

  // proves: shortcuts_listed
  test('a command shows the same list, in a dialog', async () => {
    const env = await load();
    try {
      const { el } = await show(env, fence(GRAPH));
      el.querySelector('.thoughtknot-viewport').dispatch('keydown', { key: '?', shiftKey: true });
      const onCard = rowsOf(el);
      command(env, 'shortcuts').callback();
      const dialog = env.state.modals.at(-1);
      assert.ok(dialog, 'a dialog opened');
      assert.deepEqual(rowsOf(dialog.contentEl), onCard);
    } finally {
      env.uninstall();
    }
  });
});

describe('the drawing’s commands can be given keys in Hotkeys', () => {
  // proves: shortcuts_listed
  test('Zoom in, Zoom out, Fit and Full screen are commands, with no keys of their own', async () => {
    const env = await load();
    try {
      for (const id of ['zoom-in', 'zoom-out', 'fit', 'full-screen']) {
        const c = command(env, id);
        assert.ok(c, `${id} is a command`);
        assert.equal(c.hotkeys, undefined, `${id} takes no keys a person has not given it`);
        assert.equal(can(env, id), false, `${id} waits for a drawing to be used`);
      }
    } finally {
      env.uninstall();
    }
  });

  // proves: shortcuts_listed
  test('each acts on the drawing last used', async () => {
    const env = await load({ width: 300 });
    try {
      const { el } = await show(env, fence(GRAPH));
      const fitted = widthOf(el);
      el.querySelector('.thoughtknot-viewport').focus();
      assert.equal(can(env, 'zoom-in'), true);
      run(env, 'zoom-in');
      assert.ok(widthOf(el) > fitted, 'zoomed in');
      run(env, 'fit');
      assert.equal(widthOf(el), fitted, 'fitted');
      run(env, 'full-screen');
      assert.ok(env.doc.body.querySelector('.thoughtknot-fullscreen'), 'full screen');
      run(env, 'full-screen');
      assert.equal(env.doc.body.querySelector('.thoughtknot-fullscreen'), null, 'and back');
    } finally {
      env.uninstall();
    }
  });
});
