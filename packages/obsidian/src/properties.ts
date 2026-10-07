// The inspector's properties (spec §14, inspector and inspector_native): every property of the selected thing or link,
// shown and edited as Obsidian's own Properties panel shows a note's — one row each, with its name, an icon for its type
// that opens a menu to change the type or remove it, and a field suited to the type: a number field, a date picker, a
// switch for true or false. It is built on Obsidian's own markup and classes, so it takes the theme for free. Each change is
// checked against its type and written as text into the block being edited (§2, edits are text).
import { Menu, setIcon } from 'obsidian';
import { parseValue, propertiesOf, propertyNames, renameProperty, setProperty } from '@graph-note/core';
import type { NoteReading, Property, PropType, Target } from '@graph-note/core';

/** What the properties need: the reading, the thing or link, and the block being edited, to read and to replace. */
export interface PropertiesOptions {
  reading: NoteReading;
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
}

/** Each type the document profile holds, in the order and words Obsidian's menu uses, with its icon. List is apart. */
const TYPES: { type: PropType; title: string; icon: string }[] = [
  { type: 'text', title: 'Text', icon: 'text' },
  { type: 'number', title: 'Number', icon: 'binary' },
  { type: 'boolean', title: 'Checkbox', icon: 'check-square' },
  { type: 'date', title: 'Date', icon: 'calendar' },
  { type: 'datetime', title: 'Date & time', icon: 'clock' },
];
const titleOf = (t: PropType) => TYPES.find((x) => x.type === t)?.title ?? t;

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
    .createDiv({ cls: 'metadata-properties-title', text: 'Properties' });
  const content = box.createDiv({ cls: 'metadata-content' });
  const rows = content.createDiv({ cls: 'metadata-properties' });
  const alert = box.createDiv({ cls: 'graph-note-alert', attr: { role: 'alert' } });
  alert.hidden = true;
  const listId = `graph-note-names-${++lists}`;
  const names = box.createEl('datalist', { attr: { id: listId } });
  for (const n of propertyNames(o.reading, o.graph, o.kind)) names.createEl('option', { attr: { value: n } });

  const refuse = (key: string, why: string) => {
    alert.hidden = false;
    alert.setText(`${key}: ${why}.`);
  };
  /** Writes the edits in turn, each to the text the last one left; nothing is written if any is refused. */
  const write = (key: string, edits: { key: string; type: PropType | null; words: string }[]): boolean => {
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
      icon.setAttribute('aria-label', `Type of ${state.key || 'new property'}: ${titleOf(state.type)}`);
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
      const r = keys.has(next)
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
    const menu = () => {
      const m = new Menu();
      for (const t of TYPES) {
        m.addItem((item) =>
          item
            .setTitle(t.title)
            .setIcon(t.icon)
            .setChecked(t.type === state.type)
            .onClick(() => {
              if (t.type === state.type) return;
              const words = t.type === 'boolean' ? state.words : wordsIn(input, state.type, state.words);
              if (state.written && !write(state.key, [{ key: state.key, type: t.type, words }])) return;
              state.type = t.type;
              state.words = words;
              show();
              refield();
            }),
        );
        // List, after Text, as Obsidian orders it: offered, and refused with the reason until a list is held as linked things
        if (t.type === 'text')
          m.addItem((item) =>
            item
              .setTitle('List')
              .setIcon('list')
              .onClick(() =>
                refuse(
                  state.key || 'new property',
                  'lists are coming, as linked things; until then, write one property for each value',
                ),
              ),
          );
      }
      m.addSeparator();
      m.addItem((item) =>
        item
          .setTitle('Remove')
          .setIcon('trash-2')
          .setWarning(true)
          .onClick(() => {
            if (state.written && !write(state.key, [{ key: state.key, type: null, words: '' }])) return;
            keys.delete(state.key);
            el.remove();
          }),
      );
      const r = icon.getBoundingClientRect();
      m.showAtPosition({ x: r.left, y: r.bottom });
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
