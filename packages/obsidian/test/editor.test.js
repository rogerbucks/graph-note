// The note's own editor (spec §4):
// - Typing in a graph block in the note adds the comma and the colon as the pane does.
//   Obsidian's brackets are paired as you type.
// - A note nobody is editing is never rewritten.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, wait } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { PATH } from './host/pane-notes.js';

before(() => build());

describe('the comma added for you in the note itself', () => {
  /** A typing update of the note's own editor: `text` after a ( was typed at `caret`. */
  function typing(text, caret, dispatched) {
    const doc = { toString: () => text };
    const view = { state: { doc }, dispatch: (spec) => dispatched.push(spec) };
    return {
      docChanged: true,
      state: { doc },
      view,
      transactions: [{ isUserEvent: (e) => e === 'input.type' }],
      changes: { iterChanges: (cb) => cb(caret - 1, caret - 1, caret - 1, caret, { toString: () => '(' }) },
    };
  }

  test('typing ( to start the next pattern in a graph block adds the comma, as its own step', async () => {
    const env = await load({});
    try {
      const [listener] = env.state.listeners;
      const note = '# N\n```gql\n// graph: g\n(a:T)\n(\n```';
      const dispatched = [];
      listener(typing(note, note.indexOf('(\n```') + 1, dispatched));
      assert.deepEqual(dispatched, [], 'not while the editor is updating');
      await wait(10);
      assert.equal(dispatched.length, 1);
      assert.deepEqual(dispatched[0].changes, { from: note.indexOf('(a:T)') + 5, insert: ',' });
      assert.deepEqual(
        { userEvent: dispatched[0].annotations.value },
        { userEvent: 'input.comma' },
        'its own step, so one undo takes it back',
      );
    } finally {
      env.uninstall();
    }
  });

  test('typing ( in prose, in other code, or in a query adds nothing', async () => {
    const env = await load({});
    try {
      const [listener] = env.state.listeners,
        dispatched = [];
      for (const note of [
        'Text (aside)\n(',
        '```python\nf(a)\n(\n```',
        '```gql\n// graph: g · QUERY\nMATCH (a)\n(\n```',
      ]) {
        listener(typing(note, note.lastIndexOf('(') + 1, dispatched));
      }
      await wait(10);
      assert.deepEqual(dispatched, []);
    } finally {
      env.uninstall();
    }
  });
});

describe('the colon added for you in the note itself', () => {
  function typing(text, caret, dispatched) {
    const doc = { toString: () => text };
    const view = { state: { doc }, dispatch: (spec) => dispatched.push(spec) };
    return {
      docChanged: true,
      state: { doc },
      view,
      transactions: [{ isUserEvent: (e) => e === 'input.type' }],
      changes: { iterChanges: (cb) => cb(caret - 1, caret - 1, caret - 1, caret, { toString: () => ']' }) },
    };
  }

  test('typing ] to close a bare type known to the graph adds the colon, as its own step', async () => {
    const env = await load({});
    try {
      const [listener] = env.state.listeners;
      const note = '```gql\n// graph: g\n(a:T),\n(b:T),\n(a)-[:LIKES]->(b),\n(b)-[likes]\n```';
      const dispatched = [];
      listener(typing(note, note.indexOf('likes]') + 6, dispatched));
      await wait(10);
      assert.equal(dispatched.length, 1);
      const at = note.indexOf('likes]');
      assert.deepEqual(dispatched[0].changes, { from: at, to: at + 5, insert: ':LIKES' });
      assert.deepEqual({ userEvent: dispatched[0].annotations.value }, { userEvent: 'input.colon' });
    } finally {
      env.uninstall();
    }
  });
});

describe('what is added for you, with Obsidian’s brackets paired as you type', () => {
  // Obsidian pairs brackets by default: typing ( inserts () with the caret between, and typing ] before a ] already there
  // only moves the caret past it. The comma and the colon must come all the same.
  function update({ text, before = text, inserted = null, from = 0, head, startHead }, dispatched) {
    const doc = { toString: () => text };
    const view = { state: { doc }, dispatch: (spec) => dispatched.push(spec) };
    return {
      docChanged: inserted !== null,
      startState: { doc: { toString: () => before }, selection: { main: { head: startHead } } },
      state: { doc, selection: { main: { head } } },
      view,
      transactions: [{ isUserEvent: (e) => e === 'input.type' }],
      changes: {
        iterChanges: (cb) => {
          if (inserted !== null) cb(from, from, from, from + inserted.length, { toString: () => inserted });
        },
      },
    };
  }

  test('typing ( that inserts () still adds the comma', async () => {
    const env = await load({});
    try {
      const [listener] = env.state.listeners;
      const note = '# N\n```gql\n// graph: g\n(a:T)\n()\n```',
        from = note.indexOf('()\n```'),
        dispatched = [];
      listener(update({ text: note, inserted: '()', from, head: from + 1, startHead: from }, dispatched));
      await wait(10);
      assert.deepEqual(dispatched[0]?.changes, { from: note.indexOf('(a:T)') + 5, insert: ',' });
    } finally {
      env.uninstall();
    }
  });

  test('typing ] over the ] already there still adds the colon', async () => {
    const env = await load({});
    try {
      const [listener] = env.state.listeners;
      const note = '```gql\n// graph: g\n(a:T),\n(b:T),\n(a)-[:LIKES]->(b),\n(b)-[likes]\n```',
        at = note.indexOf('likes]'),
        dispatched = [];
      listener(update({ text: note, head: at + 6, startHead: at + 5 }, dispatched));
      await wait(10);
      assert.deepEqual(dispatched[0]?.changes, { from: at, to: at + 5, insert: ':LIKES' });
    } finally {
      env.uninstall();
    }
  });
});

describe('a note nobody is editing', () => {
  // comma_never_rewritten_unasked (spec §4): drawing a note never rewrites it.
  // The line break is read as the comma, and the fix is offered, not made.
  test('is drawn with a missing comma read in, and offered the fix, but never rewritten', async () => {
    const { fakeContext } = await import('./host/fake-obsidian.js');
    const block = "// graph: g\n(a:T {name: 'A'})\n(b:T {name: 'B'})";
    const note = ['# N', '', fence(block), ''].join('\n');
    const env = await load({ files: { [PATH]: note } });
    try {
      const el = env.doc.body.createDiv();
      await env.state.processors.get('gql')(block, el, fakeContext(note, 2));
      assert.equal(el.querySelectorAll('g.node').length, 2, 'both things are drawn');
      assert.match(el.querySelector('.thoughtknot-problems').textContent, /a comma is missing at the end of this line/);
      await wait(400);
      assert.equal(env.state.files.get(PATH), note, 'the note is as it was');
    } finally {
      env.uninstall();
    }
  });
});
