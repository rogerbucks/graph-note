// The form that asks, when List is chosen for a property, for the kind and the relationship (spec §14,
// list_as_linked_things). It has two fields, offered the kinds and relationships the graph already uses. Then Make list
// or Cancel.
import { word } from '@thoughtknot/core';
import type { ListShape } from '@thoughtknot/core';

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
  const form = parent.createDiv({ cls: 'thoughtknot-list-form' });
  const id = ++forms;
  form.createEl('p', {
    cls: 'thoughtknot-list-note',
    text: o.property ? word('list.explain-of', { property: o.property }) : word('list.explain'),
  });
  const ask = (label: string, value: string, options: string[], name: string, part: string) => {
    const input = form.createEl('input', {
      cls: 'metadata-input metadata-input-text',
      attr: {
        type: 'text',
        'aria-label': label,
        placeholder: name,
        list: `thoughtknot-list-${id}-${part}`,
        autocapitalize: 'none',
      },
    });
    input.value = value;
    const list = form.createEl('datalist', { attr: { id: `thoughtknot-list-${id}-${part}` } });
    for (const v of options) list.createEl('option', { attr: { value: v } });
    return input;
  };
  const kind = ask(word('list.kind-label'), o.suggested.kind, o.kinds, word('list.kind'), 'kind');
  const rel = ask(word('list.rel-label'), o.suggested.rel, o.rels, word('list.rel'), 'rel');
  const make = () => void done({ kind: kind.value.trim(), rel: rel.value.trim() });
  const button = (label: string, run: () => void, cls = '') =>
    form
      .createEl('button', { cls, text: label, attr: { type: 'button', 'aria-label': label } })
      .addEventListener('click', run);
  kind.focus();
  button(word('list.make'), make, 'mod-cta');
  button(word('list.cancel'), () => void done(null));
  for (const input of [kind, rel])
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') make();
      else if (e.key === 'Escape') void done(null);
    });
}
