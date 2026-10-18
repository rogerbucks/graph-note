// The cards' heights in the editing view (spec §4, page_stays_still; the review of #91, 11 Oct 2026). A card's last
// height is kept by its note and the line its block opens on. So a note opened again tells CodeMirror its cards' heights
// at once. Only the heights of blocks the note still has are kept, so the store never grows past the notes' blocks.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { PATH, READER, NOTE } from './host/card-notes.js';
import { cardsOf, openNote, place } from './host/editing-view.js';

before(() => build());

describe('the cards’ heights', () => {
  test('kept for a note opened again, and forgotten for a block the note no longer has', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const [first] = cardsOf(openNote(env, NOTE, PATH).state);
      const dom = await place(env, first.widget, until);
      first.widget.measured(dom, 412);
      const [reopened] = cardsOf(openNote(env, NOTE, PATH).state);
      assert.equal(reopened.widget.estimatedHeight, 412, 'the note opened again: its card’s height is known');
      // the block taken out of the note, then another written where it was: the old height is not the new block's
      const without = NOTE.replace(fence(READER) + '\n', '');
      assert.equal(cardsOf(openNote(env, without, PATH).state).length, 0);
      const other = NOTE.replace(READER, "// graph: other\n(x:Thing {name: 'X'})");
      const [another] = cardsOf(openNote(env, other, PATH).state);
      assert.equal(another.widget.estimatedHeight, -1);
      first.widget.destroy(dom);
    } finally {
      env.uninstall();
    }
  });
});
