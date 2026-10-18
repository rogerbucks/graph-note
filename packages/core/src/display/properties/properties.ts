// The inspector's properties (spec §14, inspector and inspector_native): every property of the selected thing or link,
// shown and edited as Obsidian's own Properties panel shows a note's — one row each, with its name, an icon for its type
// that opens a menu to change the type or remove it, and a field suited to the type: a number field, a date picker, a
// switch for true or false. It is built on Obsidian's own markup and classes, so it takes the theme for free. Each change is
// checked against its type and written as text into the block being edited (§2, edits are text). A property chosen as a
// List is held as things linked to this one, and shown as chips (list-row.ts), asked for in list-form.ts.
import { displayHost, isPhone, setIcon } from '../host';
import type { MenuEntry } from '../host';
import {
  acceptNameFirst,
  linkedValues,
  listsOf,
  makeList,
  parseValue,
  propertiesOf,
  propertyNames,
  renameProperty,
  setProperty,
  word,
} from '@graph-note/core';
import type { ListShape, NoteReading, Property, PropType, Target } from '@graph-note/core';
import { listForm, suggestShape } from './list-form';
import { menuPosition } from './menu-place';
import { listRow } from './list-row';
import type { DeclaredList, ListRow } from './list-row';

/** What the properties need: the reading, the thing or link, and the block being edited, to read and to replace. */
export interface PropertiesOptions {
  reading: NoteReading;
  /** The note as it is now, with what is typed: what a write is checked against (§4), never the older drawing. */
  now: () => NoteReading;
  graph: string;
  /** The thing or link, as the drawing counts it. */
  target: Target;
  /** The thing's kind, for the names to offer; empty for a link. */
  kind: string;
  /** The block's text as it is now. */
  text: () => string;
  /** The target as counted in the block being edited. */
  inBlock: () => Target;
  replace: (text: string) => void;
  /** The lists made in this editing session, kept by the editor: a list with no value yet is no text, so the graph cannot show it. */
  lists: DeclaredList[];
}

/** Each type the document profile holds, in the order and words Obsidian's menu uses, with its icon. List is apart. */
const TYPES: { type: PropType; icon: string }[] = [
  { type: 'text', icon: 'text' },
  { type: 'number', icon: 'binary' },
  { type: 'boolean', icon: 'check-square' },
  { type: 'date', icon: 'calendar' },
  { type: 'datetime', icon: 'clock' },
];
/** A type's name as the menu says it, in the person's language. */
const titleOf = (t: PropType): string => word(`properties.type.${t}`);

let lists = 0;

/** This device's offset on the day and time given (a local YYYY-MM-DDTHH:MM, as a date and time field holds), or now. */
function offsetOn(local: string): string {
  const at = new Date(local),
    minutes = -(Number.isNaN(at.getTime()) ? new Date() : at).getTimezoneOffset(),
    sign = minutes < 0 ? '-' : '+',
    abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** A field suited to the type, holding the value in words. */
function field(parent: HTMLElement, type: PropType, words: string, label: string): HTMLInputElement {
  const attr = { 'aria-label': label };
  if (type === 'boolean') {
    const box = parent.createEl('input', { cls: 'metadata-input-checkbox', attr: { ...attr, type: 'checkbox' } });
    box.checked = /^true$/i.test(words);
    return box;
  }
  const kinds = {
    text: ['text', 'metadata-input metadata-input-text'],
    number: ['number', 'metadata-input metadata-input-number'],
    date: ['date', 'metadata-input metadata-input-text mod-date'],
    datetime: ['datetime-local', 'metadata-input metadata-input-text mod-datetime'],
  } as const;
  const [inputType, cls] = kinds[type];
  const input = parent.createEl('input', { cls, attr: { ...attr, type: inputType } });
  input.value = type === 'datetime' ? words.replace(/(Z|[+-]\d\d:?\d\d)$/, '') : words;
  return input;
}

/** The value a field holds, in words, as parseValue reads it. */
function wordsIn(input: HTMLInputElement, type: PropType, was: string): string {
  if (type === 'boolean') return input.checked ? 'true' : 'false';
  // an instant keeps the offset it was written with; a new one takes this device's on the day chosen
  if (type === 'datetime' && input.value)
    return input.value + (/(Z|[+-]\d\d:?\d\d)$/.exec(was)?.[1] ?? offsetOn(input.value));
  return input.value;
}

/** Shows the properties of a thing or link, editable, as Obsidian's Properties panel. */
export function renderProperties(parent: HTMLElement, o: PropertiesOptions): void {
  const box = parent.createDiv({ cls: 'graph-note-inspector metadata-container' });
  box
    .createDiv({ cls: 'metadata-properties-heading' })
    .createDiv({ cls: 'metadata-properties-title', text: word('details.properties') });
  const content = box.createDiv({ cls: 'metadata-content' });
  const rows = content.createDiv({ cls: 'metadata-properties' });
  const alert = box.createDiv({ cls: 'graph-note-alert', attr: { role: 'alert' } });
  alert.hidden = true;
  const status = box.createDiv({ cls: 'graph-note-status', attr: { role: 'status' } });
  const listId = `graph-note-names-${++lists}`;
  const names = box.createEl('datalist', { attr: { id: listId } });
  for (const n of propertyNames(o.reading, o.graph, o.kind)) names.createEl('option', { attr: { value: n } });

  const refuse = (key: string, why: string) => {
    alert.hidden = false;
    alert.setText(`${key}: ${why}.`);
  };
  /** Why nothing can be changed yet: the thing is drawn under a suggested name, which a change would have to write (§4). */
  const unnamed = () => ('thing' in o.target ? acceptNameFirst(o.now(), o.graph, [o.target.thing]) : null);
  /** Writes the edits in turn, each to the text the last one left; nothing is written if any is refused. */
  const write = (key: string, edits: { key: string; type: PropType | null; words: string }[]): boolean => {
    const first = unnamed();
    if (first) {
      refuse(key, first);
      return false;
    }
    let text = o.text();
    for (const e of edits) {
      const parsed = e.type === null ? null : parseValue(e.type, e.words);
      if (parsed && !parsed.ok) {
        refuse(key, parsed.error);
        return false;
      }
      const r = setProperty(text, o.graph, o.inBlock(), e.key, parsed ? parsed.gql : null);
      if (!r.ok) {
        refuse(key, r.reason);
        return false;
      }
      text = r.text;
    }
    alert.hidden = true;
    if (text !== o.text()) o.replace(text);
    return true;
  };

  /** The lists this thing holds, by relationship and kind: found in the graph, or made in this session. */
  const listRows = new Map<string, ListRow>();
  const thing = 'thing' in o.target ? o.target.thing : null;
  /** Shows a list's row, or its values in the row it has; the list is remembered for the next time the inspector is drawn. */
  const showList = (
    shape: ListShape,
    things = thing === null ? [] : linkedValues(o.reading, o.graph, thing, shape),
    label = '',
  ) => {
    if (thing === null) return;
    const id = `${shape.rel}\u0000${shape.kind}`;
    // the name typed for the property is kept with the list for this editing session only: the note records no such name
    let declared = o.lists.find((l) => l.thing === thing && l.rel === shape.rel && l.kind === shape.kind);
    if (!declared) o.lists.push((declared = { thing, rel: shape.rel, kind: shape.kind, ...(label ? { label } : {}) }));
    const have = listRows.get(id);
    if (have) return have.merge(things);
    listRows.set(
      id,
      listRow(
        rows,
        {
          reading: o.reading,
          now: o.now,
          graph: o.graph,
          thing,
          text: o.text,
          replace: o.replace,
          refuse: (key, why) => {
            status.setText('');
            refuse(key, why);
          },
          clear: () => (alert.hidden = true),
          say: (words) => status.setText(words),
        },
        shape,
        things,
        declared.label,
      ),
    );
  };

  /** The names the thing or link has now, as this panel knows them: none may be taken twice. */
  const keys = new Set(propertiesOf(o.reading, o.graph, o.target).map((p) => p.key));

  /** One row: its type icon and name, and its field. `p` is null for a property being added. */
  const row = (p: Property | null) => {
    const state: { key: string; type: PropType; words: string; written: boolean } = {
      key: p?.key ?? '',
      type: p?.type ?? 'text',
      words: p?.value ?? '',
      written: !!p,
    };
    const el = rows.createDiv({
      cls: 'metadata-property',
      attr: { 'data-property-key': state.key, 'data-property-type': state.type, tabindex: '-1' },
    });
    const keyEl = el.createDiv({ cls: 'metadata-property-key' });
    const icon = keyEl.createSpan({ cls: 'metadata-property-icon', attr: { role: 'button', tabindex: '0' } });
    const name = keyEl.createEl('input', {
      cls: 'metadata-property-key-input',
      attr: { type: 'text', list: listId, autocapitalize: 'none', placeholder: 'Property name' },
    });
    name.value = state.key;
    const valueEl = el.createDiv({ cls: 'metadata-property-value' });
    const valueLabel = () => (state.written ? `Value of ${state.key}` : 'Value of new property');
    let input = field(valueEl, state.type, state.words, valueLabel());
    const show = () => {
      setIcon(icon, TYPES.find((t) => t.type === state.type)?.icon ?? 'text');
      icon.setAttribute(
        'aria-label',
        word('properties.type-of', { name: state.key || word('properties.new'), type: titleOf(state.type) }),
      );
      name.setAttribute('aria-label', state.written ? `Name of ${state.key}` : 'New property name');
      input.setAttribute('aria-label', valueLabel());
      el.setAttribute('data-property-key', state.written ? state.key : '');
      el.setAttribute('data-property-type', state.type);
    };
    const refield = () => {
      valueEl.empty();
      input = field(valueEl, state.type, state.words, valueLabel());
      input.addEventListener('change', onValue);
    };
    // a value is written when its field is left; a new property once it has both a name and a value
    const onValue = () => {
      const words = wordsIn(input, state.type, state.words);
      if (!state.written) {
        if (!state.key) return refuse('new property', 'name it first');
        if (words === '' && state.type !== 'boolean') return;
        if (keys.has(state.key)) return refuse(state.key, `it already has a property called ${state.key}`);
      }
      if (!write(state.key, [{ key: state.key, type: state.type, words }])) return;
      state.words = words;
      if (!state.written) {
        state.written = true;
        keys.add(state.key);
        show();
      }
    };
    input.addEventListener('change', onValue);
    name.addEventListener('change', () => {
      const next = name.value.trim();
      if (!next || next === state.key) return void (name.value = state.key);
      if (!state.written) {
        state.key = next;
        show();
        onValue();
        return;
      }
      // renamed in place: only the name changes, its value kept exactly as written
      const first = unnamed();
      const r = first
        ? ({ ok: false, reason: first } as const)
        : keys.has(next)
          ? ({ ok: false, reason: `it already has a property called ${next}` } as const)
          : renameProperty(o.text(), o.graph, o.inBlock(), state.key, next);
      if (!r.ok) {
        refuse(state.key, r.reason);
        name.value = state.key;
        return;
      }
      alert.hidden = true;
      o.replace(r.text);
      keys.delete(state.key);
      keys.add(next);
      state.key = next;
      show();
    });
    /** Asks for the kind and the relationship where the field was, then holds the values as linked things. */
    const askList = () => {
      if (thing === null) return;
      valueEl.empty();
      const g = o.reading.graphs.get(o.graph);
      const kinds = [...new Set((g?.boxes ?? []).flatMap((b) => b.kind.split(' · ').filter(Boolean)))].sort();
      const rels = [...new Set((g?.links ?? []).map((l) => l.type))].sort();
      listForm(valueEl, { kinds, rels, suggested: suggestShape(state.key), property: state.key }, (shape) => {
        if (!shape) {
          alert.hidden = true;
          refield();
          return true;
        }
        const r = makeList(o.text(), o.now(), o.graph, thing, state.written ? state.key : null, shape);
        if (!r.ok) {
          refuse(state.key || 'new property', r.reason);
          return false;
        }
        alert.hidden = true;
        if (r.text !== o.text()) o.replace(r.text);
        keys.delete(state.key);
        el.remove();
        showList(shape, r.things, state.key);
        status.setText(`${shape.rel}: ${r.said}.`);
        return true;
      });
    };
    const menu = () => {
      const entries: MenuEntry[] = [];
      for (const t of TYPES) {
        entries.push({
          title: titleOf(t.type),
          icon: t.icon,
          checked: t.type === state.type,
          onClick: () => {
            if (t.type === state.type) return;
            const words = t.type === 'boolean' ? state.words : wordsIn(input, state.type, state.words);
            if (state.written && !write(state.key, [{ key: state.key, type: t.type, words }])) return;
            state.type = t.type;
            state.words = words;
            show();
            refield();
          },
        });
        // List, after Text, as Obsidian orders it: held as linked things, so only a thing can have one
        if (t.type === 'text' && thing !== null)
          entries.push({ title: word('properties.type.list'), icon: 'list', onClick: askList });
      }
      entries.push('separator', {
        title: word('properties.remove'),
        icon: 'trash-2',
        warning: true,
        onClick: () => {
          if (state.written && !write(state.key, [{ key: state.key, type: null, words: '' }])) return;
          keys.delete(state.key);
          el.remove();
        },
      });
      // placed where every row stays on screen (the separator takes a row's room), measured in the window the icon is in
      // and shown in that window's document
      displayHost().menu(
        entries,
        menuPosition(icon.getBoundingClientRect(), entries.length, icon.win.innerHeight, isPhone()),
        icon.doc,
      );
    };
    icon.addEventListener('click', menu);
    icon.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      menu();
    });
    show();
    return name;
  };

  for (const p of propertiesOf(o.reading, o.graph, o.target)) row(p);
  if (thing !== null) {
    for (const shape of listsOf(o.reading, o.graph, thing)) showList(shape);
    for (const l of [...o.lists]) if (l.thing === thing) showList(l);
  }
  const add = content.createDiv({
    cls: 'metadata-add-button text-icon-button',
    attr: { role: 'button', tabindex: '0' },
  });
  setIcon(add.createSpan({ cls: 'text-button-icon' }), 'plus');
  add.createSpan({ cls: 'text-button-label', text: 'Add property' });
  const adding = () => row(null).focus();
  add.addEventListener('click', adding);
  add.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    adding();
  });
}
