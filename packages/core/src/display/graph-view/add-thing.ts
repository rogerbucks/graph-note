// Adding a thing in a drawing (spec §5, add_thing; §4, name_from_text, suggested_name_unique): while the card is edited,
// Add a thing asks for the thing's text first, and suggests its name from the text as it is typed — in the style of the
// graph's names, never one of them — shown before anything is written. Add the thing then writes it into the text being
// edited, as one edit an undo takes back. A name of the user's own is kept as the text changes, and held to the same rules.
import { addThing, suggestName, word } from '@graph-note/core';
import { button } from './view-bar';
import type { ViewOptions } from './view-options';

let forms = 0;

/** The add-a-thing strip of one drawing. */
export class AddThing {
  private readonly el: HTMLElement;
  private readonly controls: HTMLElement;
  private readonly said: HTMLElement;
  private open = false;

  constructor(
    parent: HTMLElement,
    private readonly o: ViewOptions,
  ) {
    this.el = parent.createDiv({
      cls: 'graph-note-add-thing',
      attr: { role: 'group', 'aria-label': word('add.group') },
    });
    this.controls = this.el.createDiv({ cls: 'graph-note-add-thing-controls' });
    this.said = this.el.createSpan({ cls: 'graph-note-walk-said', attr: { 'aria-live': 'polite' } });
    this.show();
  }

  /** The strip as the card stands: Add a thing while edited; the form while adding; both end when editing does. */
  show(): void {
    const editing = !!this.o.editing?.()?.session;
    if (this.open && !editing) this.open = false;
    this.controls.empty();
    if (!editing) {
      this.said.setText('');
      this.el.hidden = true;
      return;
    }
    this.el.hidden = false;
    if (this.open) this.form();
    else button(this.controls, word('add.thing'), 'plus', () => this.start(), word('add.thing'));
  }

  private start(): void {
    this.open = true;
    this.said.setText('');
    this.show();
    this.controls.querySelector('input')?.focus();
  }

  /** The form: the text first; once there is some, the name suggested from it, and the kind to give the thing. */
  private form(): void {
    const el = this.controls;
    const label = (parent: HTMLElement, words: string, attr: Record<string, string> = {}) =>
      parent
        .createEl('label', { text: words })
        .createEl('input', { attr: { type: 'text', 'aria-label': words, ...attr } });
    const text = label(el, word('add.text'));
    const row = el.createDiv({ cls: 'graph-note-add-name' });
    row.hidden = true;
    const name = label(row, word('add.name'), { autocapitalize: 'none' });
    const listId = `graph-note-kinds-${++forms}`;
    const kind = label(el, word('add.kind'), { list: listId });
    const kinds = el.createEl('datalist', { attr: { id: listId } });
    const boxes = this.o.reading.graphs.get(this.o.graph)?.boxes ?? [];
    for (const k of [...new Set(boxes.flatMap((b) => b.kind.split(' · ').filter(Boolean)))].sort())
      kinds.createEl('option', { attr: { value: k } });
    const alert = el.createDiv({ attr: { role: 'alert' } });
    // the names the note has now, with what is typed: never the card's drawing, which can be older (§4)
    const now = () => this.o.editing?.()?.session?.current() ?? this.o.reading;
    // a name the user typed is kept as the text changes; cleared, the suggested one comes back
    let own = false;
    const suggest = () => {
      alert.setText('');
      const words = text.value.trim();
      row.hidden = !words;
      if (!words) return this.said.setText('');
      if (!own)
        name.value = suggestName(
          now(),
          this.o.graph,
          words,
          kind.value.trim() || undefined,
          this.o.editing?.()?.session?.text,
        );
      this.said.setText(own ? word('add.named', { name: name.value }) : word('add.suggested', { name: name.value }));
    };
    text.addEventListener('input', suggest);
    kind.addEventListener('input', suggest);
    name.addEventListener('input', () => {
      own = name.value.trim() !== '';
      suggest();
    });
    const submit = () => {
      const ed = this.o.editing?.(),
        block = ed?.session?.text;
      if (!ed || block === undefined) return alert.setText(word('add.not-editing'));
      // the name written is the name shown: a name taken since is refused, never swapped for another unseen
      const r = addThing(now(), this.o.graph, block, {
        text: text.value,
        name: name.value,
        kind: kind.value,
      });
      if ('refused' in r) return alert.setText(r.refused);
      ed.replace(r.text);
      this.open = false;
      this.show();
      this.said.setText(word('add.added', { text: text.value.trim(), name: r.name }));
      this.controls.querySelector('button')?.focus();
    };
    const cancel = () => {
      this.open = false;
      this.said.setText('');
      this.show();
      this.controls.querySelector('button')?.focus();
    };
    // Enter adds and Escape cancels, from any field; the Enter that ends an IME composition is the keyboard's, not ours
    for (const field of [text, name, kind])
      field.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.isComposing) {
          e.preventDefault();
          submit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      });
    button(el, word('add.it'), 'check', submit);
    button(el, word('add.cancel'), 'x', cancel);
  }
}
