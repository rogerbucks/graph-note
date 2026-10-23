// A thing of a note too big to read at once, chosen in its overview (editor spec §53, scale_in_parts; way E, step 7).
// Its properties show under the overview, each in a field. A change is written to the note's text first, only on the
// lines that wrote the thing (editInParts). Obsidian then draws the block again, and the store reads the changed note.
// In reading view the fields are shown but cannot be changed.
import { editInParts, parseValue, setProperty, word } from '@thoughtknot/core';
import type { MeshIndex, PropType } from '@thoughtknot/core';
import { Notice } from 'obsidian';
import type ThoughtKnotPlugin from './main';

/** Where the chosen thing is: its store, its note's path and text as read, its graph, and if the card is read only. */
export interface StoredThing {
  ix: MeshIndex;
  path: string;
  note: string;
  graph: string;
  readOnly: boolean;
}

/** The type a stored value is edited as, from how it was read. None: it is shown, but not edited here. */
function typeOf(value: unknown): PropType | null {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value !== 'string') return null;
  if (/^\d{4}-\d\d-\d\d$/.test(value)) return 'date';
  return /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d/.test(value) ? 'datetime' : 'text';
}

/** Writes `name: words` on the thing, in the note's text, if the note has not changed since the store read it. */
async function write(
  plugin: ThoughtKnotPlugin,
  at: StoredThing,
  key: string,
  name: string,
  type: PropType,
  words: string,
) {
  const value = parseValue(type, words);
  if (!value.ok) return void new Notice(word('properties.refused', { name, why: value.error }));
  const edit = editInParts(at.ix, at.path, at.note, at.graph, key, (lines) =>
    setProperty(lines, at.graph, { thing: key }, name, value.gql),
  );
  if (!edit.ok) return void new Notice(word('properties.refused', { name, why: edit.reason }));
  // read and written in one step, so a change made since the store read the note is never written over
  const file = plugin.app.vault.getFileByPath(at.path);
  let written = false;
  if (file)
    await plugin.app.vault.process(file, (now) => {
      written = now === at.note;
      return written ? edit.text : now;
    });
  if (!written) new Notice(word('properties.refused', { name, why: word('editing.note-changed') }));
}

/** Shows thing `key`'s properties at the end of `parent`, in place of any thing shown there before. */
export function showStoredThing(
  plugin: ThoughtKnotPlugin,
  parent: HTMLElement,
  at: StoredThing,
  key: string,
  props: Readonly<Record<string, unknown>>,
): void {
  parent.querySelector('.thoughtknot-stored-thing')?.remove();
  const box = parent.createDiv({ cls: 'thoughtknot-stored-thing metadata-container' });
  const name = typeof props.name === 'string' && props.name ? props.name : key;
  box.createEl('h4', { text: word('massive.thing', { name }) });
  if (at.readOnly) box.createEl('p', { cls: 'thoughtknot-hint', text: word('massive.read-only') });
  for (const [prop, value] of Object.entries(props)) {
    if (prop === 'id') continue;
    const type = typeOf(value);
    const row = box.createDiv({ cls: 'metadata-property' });
    row.createSpan({ cls: 'metadata-property-key', text: prop });
    const input = row.createEl('input', {
      cls: 'metadata-input metadata-input-text',
      attr: { type: 'text', 'aria-label': word('properties.value-of', { name: prop }) },
    });
    input.value = typeof value === 'string' ? value : JSON.stringify(value);
    input.disabled = at.readOnly || !type;
    if (type) input.addEventListener('change', () => void write(plugin, at, key, prop, type, input.value));
  }
}
