// A thing of a note too big to read at once, chosen in its overview (editor spec §53, scale_in_parts; way E, step 7).
// Its properties show under the overview, each in a field. A change is written to the note's text first, only on the
// lines that wrote the thing (editInParts). Obsidian then draws the block again, and the store reads the changed note.
// In reading view the fields are shown but cannot be changed. The fields are the display layer's (massive-thing.ts).
import { setInParts, word } from '@thoughtknot/core';
import type { MeshIndex, PropType } from '@thoughtknot/core';
import { massiveThing } from '@thoughtknot/core/display/graph-view/massive-thing';
import type ThoughtKnotPlugin from './main';
import { changeVaultNote } from './storage/plugin-notes';

/** Where the chosen thing is: its store, its note's path and text as read, its graph, and if the card is read only. */
export interface StoredThing {
  ix: MeshIndex;
  path: string;
  note: string;
  graph: string;
  readOnly: boolean;
}

/** Writes `prop` on the thing, in the note's text, if the note has not changed since the store read it. Gives why not. */
async function write(
  plugin: ThoughtKnotPlugin,
  at: StoredThing,
  key: string,
  prop: string,
  type: PropType,
  words: string,
): Promise<string | null> {
  const edit = setInParts(at.ix, { note: at.path, text: at.note, graph: at.graph }, key, prop, type, words);
  if (!edit.ok) return edit.reason;
  // read and written in one step, so a change made since the store read the note is never written over
  let written = false;
  const done = await changeVaultNote(plugin.app, at.path, (now) => {
    written = now === at.note;
    return written ? edit.text : now;
  });
  return !done.ok ? done.reason : !written ? word('editing.note-changed') : null;
}

/** Shows thing `key`'s properties at the end of `parent`, in place of any thing shown there before. */
export function showStoredThing(
  plugin: ThoughtKnotPlugin,
  parent: HTMLElement,
  at: StoredThing,
  key: string,
  props: Readonly<Record<string, unknown>>,
): void {
  massiveThing(parent, {
    key,
    props,
    readOnly: at.readOnly,
    change: (prop, type, words) => write(plugin, at, key, prop, type, words),
  });
}
