// The same edit writes the same bytes in the browser editor and in Obsidian (editor spec §26, cc_same_bytes), proved by
// shared cases: each case is the text typed into a note's block, and the note that results is read from both hosts, the
// browser editor's `EditorSession` (what the page sends the server) and the Obsidian plugin's edit pane (what it writes
// to the vault), loaded as its own tests load it. Both take the write from the core's session, and the display layer
// they now share (workstream C4) must not change it: the cases hold that, byte for byte, and for Undo and Redo too.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EditorSession } from '../src/editor-session.ts';
import { build, until } from '../../obsidian/test/host/load-plugin.js';
import { NOTE, READER, open, type, note } from '../../obsidian/test/host/pane-notes.js';

before(() => build());

const sha = (bytes) => `"${createHash('sha256').update(bytes).digest('hex')}"`;

/** The shared cases: a name, and the block as it is typed. Every one is a write the page and the pane both make. */
const CASES = [
  ['a thing renamed', READER.replace("'Large reader'", "'Small reader'")],
  ['a thing added', READER + ",\n(mine:Reason {title: 'Mine'})"],
  ['a link added', READER + ',\n(eyes)-[:FAVOURS]->(question)'],
  ['a line removed', READER.split('\n').slice(0, -1).join('\n')],
  ['text with quotes, an accent and an emoji', READER + ",\n(odd:Reason {title: 'It\\'s café ☕'})"],
  ['a block emptied to its graph line', '// graph: reader'],
  ['the same text typed again, which writes nothing', READER],
];

/** The note the browser editor would send the server for a block typed as `block`, or the note itself if unchanged. */
function browser(block) {
  const page = new EditorSession(NOTE, sha(NOTE));
  page.type({ text: block, start: block.length, end: block.length });
  const w = page.write();
  assert.equal(w.ok, true, 'the browser editor can write it');
  return { page, note: w.note };
}

/** The note the Obsidian plugin's pane leaves in the vault for the same typing. */
async function obsidian(block) {
  const env = await open();
  try {
    type(env.el, block);
    if (block !== READER) await until(() => note(env) !== NOTE);
    return note(env);
  } finally {
    env.uninstall();
  }
}

describe('the same edit writes the same bytes in the browser editor and in Obsidian', () => {
  for (const [name, block] of CASES) {
    test(name, async () => {
      const there = await obsidian(block);
      assert.equal(browser(block).note, there);
      assert.equal(there, NOTE.replace(READER, block));
    });
  }

  test('Undo and Redo write the same bytes in both', async () => {
    const block = READER + ",\n(mine:Reason {title: 'Mine'})";
    const env = await open();
    try {
      const { page, note: written } = browser(block);
      page.written(sha(written));
      type(env.el, block);
      await until(() => note(env) !== NOTE);
      const tools = () => env.el.querySelectorAll('.graph-note-pane-tools button');
      const undone = tools()[0];
      undone.click();
      await until(() => note(env) === NOTE);
      assert.equal(page.undo().note, NOTE);
      const redone = tools()[1];
      redone.click();
      await until(() => note(env) === written);
      assert.equal(page.redo().note, written);
    } finally {
      env.uninstall();
    }
  });
});

// C5 and C8 add their cases below, for the same requirement: edits made through the page's own controls (the details,
// the properties, the drawing's edits), once the browser page exists to make them.
