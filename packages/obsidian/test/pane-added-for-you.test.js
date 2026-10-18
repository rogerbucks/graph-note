// What the edit pane adds for you as you type (spec §4). It adds the comma when the next pattern starts on a new line. It
// adds the colon of a bare link type the graph knows. Each is a step of its own, taken back by one undo.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build } from './host/load-plugin.js';
import { READER, open, textarea, type } from './host/pane-notes.js';

before(() => build());

describe('the comma added for you', () => {
  test('starting the next pattern on a new line adds the comma at the end of the line before, and the caret stays put', async () => {
    const env = await open();
    try {
      const t = textarea(env.el);
      const before = READER + '\n';
      t.value = before;
      t.setSelectionRange(before.length, before.length);
      t.dispatch('input');
      type(env.el, before + '(');
      assert.equal(t.value, READER + ',\n(');
      assert.equal(t.selectionStart, t.value.length, 'the caret is still just after the (');
    } finally {
      env.uninstall();
    }
  });

  test('one undo takes the comma back, and only the comma', async () => {
    const env = await open();
    try {
      const t = textarea(env.el),
        before = READER + '\n';
      t.value = before;
      t.setSelectionRange(before.length, before.length);
      t.dispatch('input');
      type(env.el, before + '(');
      const ev = t.dispatch('keydown', { key: 'z', metaKey: true });
      assert.ok(ev.defaultPrevented);
      assert.equal(t.value, READER + '\n(');
      assert.equal(t.selectionStart, t.value.length);
      // the editor keeps its own history (typing_keeps_focus): the next undo takes back what was typed before it
      assert.ok(t.dispatch('keydown', { key: 'z', metaKey: true }).defaultPrevented);
      assert.equal(t.value, before, 'the next undo takes back the ( typed');
    } finally {
      env.uninstall();
    }
  });

  test('a line that is not otherwise valid gets no comma', async () => {
    const env = await open();
    try {
      const broken = READER + ',\n(x:T {name: })\n';
      const t = textarea(env.el);
      t.value = broken;
      t.setSelectionRange(broken.length, broken.length);
      t.dispatch('input');
      type(env.el, broken + '(');
      assert.equal(t.value, broken + '(');
    } finally {
      env.uninstall();
    }
  });
});

describe('the colon added for you', () => {
  // colon_added_for_you (spec §4): a link type typed without its colon, matching one type of the graph, gets it as ] is typed
  test('closing a bare type known to the graph adds the colon and the graph’s spelling; the caret stays after the ]', async () => {
    const env = await open();
    try {
      const t = textarea(env.el),
        before = READER + ',\n(eyes)-[favours';
      t.value = before;
      t.setSelectionRange(before.length, before.length);
      t.dispatch('input');
      type(env.el, before + ']');
      assert.equal(t.value, READER + ',\n(eyes)-[:FAVOURS]');
      assert.equal(t.selectionStart, t.value.length);
    } finally {
      env.uninstall();
    }
  });

  test('one undo takes the colon back, and only the colon', async () => {
    const env = await open();
    try {
      const t = textarea(env.el),
        before = READER + ',\n(eyes)-[favours';
      t.value = before;
      t.setSelectionRange(before.length, before.length);
      t.dispatch('input');
      type(env.el, before + ']');
      assert.ok(t.dispatch('keydown', { key: 'z', metaKey: true }).defaultPrevented);
      assert.equal(t.value, before + ']');
      assert.equal(t.selectionStart, t.value.length);
    } finally {
      env.uninstall();
    }
  });

  test('a first use gets no colon: it is not guessed', async () => {
    const env = await open();
    try {
      const t = textarea(env.el),
        before = READER + ',\n(eyes)-[cites';
      t.value = before;
      t.setSelectionRange(before.length, before.length);
      t.dispatch('input');
      type(env.el, before + ']');
      assert.equal(t.value, before + ']');
    } finally {
      env.uninstall();
    }
  });
});
