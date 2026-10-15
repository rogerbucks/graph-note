// The form that asks, when List is chosen for a property, for the kind and the relationship (spec §14,
// list_as_linked_things): two fields, offered the kinds and relationships the graph already uses, and Make list or Cancel.
import type { ListShape } from '@graph-note/core';

/** What the form offers: the kinds and relationships the graph uses, and the suggestions to start from. */
export interface ListFormOptions {
  kinds: string[];
  rels: string[];
  /** The kind and the relationship suggested, from the property's name. */
  suggested: ListShape;
  /** The name the user typed for the property, said in the form so it is not lost; empty when there is none. */
  property?: string;
}

let forms = 0;

/** A kind and a relationship suggested from a property's name: `tags` suggests a Tag, linked by HAS_TAG. */
export function suggestShape(key: string): ListShape {
  const word = key.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  const one = /[^s]s$/i.test(word) ? word.slice(0, -1) : word;
  return one === ''
    ? { kind: '', rel: '' }
    : { kind: one[0]?.toUpperCase() + one.slice(1), rel: `HAS_${one.toUpperCase()}` };
}

/**
 * Asks for the kind and the relationship, where a property's field was. `done` is given the shape chosen, or null for
 * Cancel; it returns false to keep the form open (the shape was refused).
 */
export function listForm(parent: HTMLElement, o: ListFormOptions, done: (shape: ListShape | null) => boolean): void {
  const form = parent.createDiv({ cls: 'graph-note-list-form' });
  const id = ++forms;
  const of = o.property ? ` of ${o.property}` : '';
  form.createEl('p', {
    cls: 'graph-note-list-note',
    text: `Each value${of} becomes a thing linked by the relationship, and the row is named after it.`,
  });
  const ask = (label: string, value: string, options: string[], name: string) => {
    const input = form.createEl('input', {
      cls: 'metadata-input metadata-input-text',
      attr: {
        type: 'text',
        'aria-label': label,
        placeholder: name,
        list: `graph-note-list-${id}-${name}`,
        autocapitalize: 'none',
      },
    });
    input.value = value;
    const list = form.createEl('datalist', { attr: { id: `graph-note-list-${id}-${name}` } });
    for (const v of options) list.createEl('option', { attr: { value: v } });
    return input;
  };
  const kind = ask('Kind of the linked things', o.suggested.kind, o.kinds, 'Kind');
  const rel = ask('Relationship from this thing', o.suggested.rel, o.rels, 'Relationship');
  const make = () => void done({ kind: kind.value.trim(), rel: rel.value.trim() });
  const button = (label: string, run: () => void, cls = '') =>
    form
      .createEl('button', { cls, text: label, attr: { type: 'button', 'aria-label': label } })
      .addEventListener('click', run);
  kind.focus();
  button('Make list', make, 'mod-cta');
  button('Cancel', () => void done(null));
  for (const input of [kind, rel])
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') make();
      else if (e.key === 'Escape') void done(null);
    });
}
