// A list in the inspector (spec §14, list_as_linked_things). It is one row for a relationship and a kind. Its values
// are the things linked to this one, shown as chips as Obsidian's Properties panel shows a list. Each is removed in
// place with its x, and a field adds a value in place. Each change is an edit of the block's text, and what it did is
// said.
import { setIcon } from '../host';
import { addToList, removeFromList, word } from '@thoughtknot/core';
import type { ListShape, ListValue, NoteReading } from '@thoughtknot/core';

/** A list the inspector knows of though the graph may hold no value for it yet: whose thing, and its shape. */
export interface DeclaredList extends ListShape {
  thing: string;
  /** The name typed for the property when the list was made: shown beside the relationship while the editor stays open. */
  label?: string;
}

/** What a list row needs of the inspector: the reading and the thing, the block's text and a way to replace it, and its messages. */
export interface ListContext {
  reading: NoteReading;
  /** The note as it is now, with what is typed: what an addition is checked against (§4), never the older drawing. */
  now: () => NoteReading;
  graph: string;
  /** The thing that holds the list. */
  thing: string;
  /** The block's text as it is now. */
  text: () => string;
  replace: (text: string) => void;
  /** Shows why an edit was refused, under the row's name. */
  refuse: (key: string, why: string) => void;
  /** Takes any refusal away. */
  clear: () => void;
  /** Says what an edit did. */
  say: (words: string) => void;
}

/** A list row on the page: its element, and a way to add values it holds that the edit just made. */
export interface ListRow {
  el: HTMLElement;
  /** Shows these values too, those already shown left as they are. */
  merge: (things: ListValue[]) => void;
}

/**
 * Adds a list row to the inspector's rows: the name of the relationship, the chips of the things linked, and an add
 * field. The name typed for the property comes before it, when there is one.
 */
export function listRow(
  parent: HTMLElement,
  c: ListContext,
  shape: ListShape,
  start: ListValue[],
  label?: string,
): ListRow {
  const values = [...start];
  const el = parent.createDiv({
    cls: 'metadata-property',
    attr: {
      'data-property-key': shape.rel,
      'data-property-type': 'list',
      'data-list-kind': shape.kind,
      tabindex: '-1',
    },
  });
  const keyEl = el.createDiv({ cls: 'metadata-property-key' });
  const icon = keyEl.createSpan({
    cls: 'metadata-property-icon',
    attr: { 'aria-label': word('list.icon', { kind: shape.kind, rel: shape.rel }) },
  });
  setIcon(icon, 'list');
  keyEl.createSpan({
    cls: 'metadata-property-key-input thoughtknot-list-key',
    text: label ? `${label} · ${shape.rel}` : shape.rel,
    attr: { title: word('list.linked', { kind: shape.kind, rel: shape.rel }) },
  });
  const box = el.createDiv({ cls: 'metadata-property-value' }).createDiv({ cls: 'multi-select-container' });
  const input = box.createEl('input', {
    cls: 'multi-select-input',
    attr: {
      type: 'text',
      'aria-label': word('list.add-to', { rel: shape.rel }),
      placeholder: word('list.add-a', { kind: shape.kind }),
    },
  });

  const changed = (r: { text: string; said: string }) => {
    c.clear();
    c.replace(r.text);
    c.say(`${shape.rel}: ${r.said}.`);
  };
  const draw = () => {
    for (const p of box.querySelectorAll('.multi-select-pill')) p.remove();
    for (const v of values) {
      const pill = box.createDiv({ cls: 'multi-select-pill', attr: { 'data-list-thing': v.thing } });
      pill.createDiv({ cls: 'multi-select-pill-content', text: v.text });
      const x = pill.createDiv({
        cls: 'multi-select-pill-remove-button',
        attr: { role: 'button', tabindex: '0', 'aria-label': word('list.remove', { name: v.text }) },
      });
      setIcon(x, 'x');
      const drop = () => {
        const r = removeFromList(c.text(), c.reading, c.graph, c.thing, shape, v.thing);
        if (!r.ok) return c.refuse(shape.rel, r.reason);
        const at = values.indexOf(v);
        values.splice(at, 1);
        changed(r);
        draw();
        // the chips were drawn again: the focus goes to the x of the chip that took its place, else to the add field
        const next = box.querySelectorAll<HTMLElement>('.multi-select-pill-remove-button')[at];
        (next ?? input).focus();
      };
      x.addEventListener('click', drop);
      x.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        drop();
      });
      box.insertBefore(pill, input);
    }
  };
  const merge = (things: ListValue[]) => {
    for (const t of things) if (!values.some((v) => v.thing === t.thing)) values.push(t);
    draw();
  };
  const add = () => {
    const r = addToList(c.text(), c.now(), c.graph, c.thing, shape, input.value);
    if (!r.ok) return c.refuse(shape.rel, r.reason);
    input.value = '';
    merge(r.things);
    changed(r);
  };
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    add();
  });
  // a value left in the field when it is left is added too, as Obsidian adds a typed item
  input.addEventListener('change', () => {
    if (input.value.trim() !== '') add();
  });
  draw();
  return { el, merge };
}
