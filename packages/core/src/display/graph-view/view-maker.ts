// Making a view by tapping (spec §7, views_by_tapping, five_view_kinds): while the card is edited, Make a view offers the
// kinds of view; the boxes tapped choose what it shows — picked by hand, the thing it is near, where a route starts and
// ends, the kinds — and its reading is said in plain English as it is built; Write the view writes its query as a view
// block of its own after the graph's last block. The strip is built once; only its words change as it goes.
import { makeView, pathsOf, readingOf, word } from '@graph-note/core';
import type { WordKey } from '@graph-note/core';
import type { ViewKind, ViewSpec } from '@graph-note/core';
import { button } from './view-bar';
import type { ViewOptions } from './view-options';

const KINDS: [ViewKind, WordKey][] = [
  ['picked', 'maker.picked'],
  ['near', 'maker.near'],
  ['reaches', 'maker.reaches'],
  ['kinds', 'maker.kinds'],
  ['path', 'maker.path'],
];

/** The view-making strip of one drawing. */
export class ViewMaker {
  private readonly el: HTMLElement;
  private making = false;
  private kind: ViewKind = 'picked';
  private picked: string[] = [];
  private depth = 1;
  private live: HTMLElement | null = null;
  private alert: HTMLElement | null = null;
  private name: HTMLInputElement | null = null;

  constructor(
    parent: HTMLElement,
    private readonly o: ViewOptions,
  ) {
    this.el = parent.createDiv({
      cls: 'graph-note-view-maker',
      attr: { role: 'group', 'aria-label': word('maker.group') },
    });
    this.show();
  }

  private textOf = (k: string) => this.o.reading.graphs.get(this.o.graph)?.boxes.find((b) => b.key === k)?.text ?? k;
  private kindOf = (k: string) => this.o.reading.graphs.get(this.o.graph)?.boxes.find((b) => b.key === k)?.kind ?? '';

  /** A box tapped: while making a view, it chooses, and true; otherwise false, and the tap opens its details. */
  tap(key: string): boolean {
    if (!this.making) return false;
    const chosen = this.kind === 'kinds' ? (this.kindOf(key).split(' · ')[0] ?? '') : key;
    if (this.kind === 'near') this.picked = [chosen];
    else if (this.kind === 'reaches')
      this.picked = this.picked.length === 1 ? [this.picked[0] ?? '', chosen] : [chosen];
    else if (this.kind === 'path')
      this.picked = pathsOf(this.o.reading, this.o.graph).some((p) => p.id === key) ? [key] : this.picked;
    else
      this.picked = this.picked.includes(chosen) ? this.picked.filter((x) => x !== chosen) : [...this.picked, chosen];
    this.update();
    return true;
  }

  /** The strip as things stand: Make a view while edited; the maker while making; a making ends when editing does. */
  show(): void {
    const editing = !!this.o.editing?.()?.session;
    if (this.making && !editing) this.making = false;
    this.el.empty();
    this.live = this.alert = this.name = null;
    if (!editing) {
      this.el.hidden = true;
      return;
    }
    this.el.hidden = false;
    if (!this.making) {
      button(this.el, word('maker.start'), 'filter', () => this.start(), word('maker.start'));
      return;
    }
    const kinds = this.el.createEl('select', { attr: { 'aria-label': word('maker.kind') } });
    for (const [v, n] of KINDS) kinds.createEl('option', { text: word(n), attr: { value: v } });
    kinds.value = this.kind;
    kinds.addEventListener('change', () => {
      this.kind = kinds.value as ViewKind;
      this.picked = [];
      this.update();
    });
    const steps = this.el.createEl('select', { attr: { 'aria-label': word('maker.steps') } });
    for (const n of ['1', '2', '3']) steps.createEl('option', { text: n, attr: { value: n } });
    steps.value = String(this.depth);
    steps.addEventListener('change', () => {
      this.depth = Number(steps.value);
      this.update();
    });
    this.name = this.el.createEl('input', {
      attr: { type: 'text', 'aria-label': word('maker.name'), placeholder: word('maker.name') },
    });
    button(this.el, word('maker.write'), 'check', () => void this.write());
    button(this.el, word('maker.stop'), 'x', () => {
      this.making = false;
      this.show();
    });
    this.live = this.el.createSpan({ cls: 'graph-note-walk-said', attr: { 'aria-live': 'polite' } });
    this.alert = this.el.createDiv({ attr: { role: 'alert' } });
    this.update();
  }

  private start(): void {
    this.making = true;
    this.picked = [];
    this.show();
  }

  /** The view as chosen so far, or null when nothing enough is chosen yet. */
  private spec(): ViewSpec | null {
    const [a, b] = this.picked;
    switch (this.kind) {
      case 'picked':
        return this.picked.length ? { kind: 'picked', ids: [...this.picked] } : null;
      case 'near':
        return a ? { kind: 'near', id: a, depth: this.depth } : null;
      case 'reaches':
        return a && b ? { kind: 'reaches', from: a, to: b, steps: 6, directed: true } : null;
      case 'kinds':
        return this.picked.length ? { kind: 'kinds', kinds: [...this.picked] } : null;
      case 'path':
        return a ? { kind: 'path', path: a } : null;
    }
  }

  private update(): void {
    const spec = this.spec();
    const hint: Record<ViewKind, string> = {
      picked: word('maker.hint-picked'),
      near: word('maker.hint-near'),
      reaches: word(this.picked.length ? 'maker.hint-reaches-end' : 'maker.hint-reaches-start'),
      kinds: word('maker.hint-kinds'),
      path: word('maker.hint-path'),
    };
    this.live?.setText(spec ? word('maker.the-view', { reading: readingOf(spec, this.textOf) }) : hint[this.kind]);
  }

  private async write(): Promise<void> {
    const spec = this.spec(),
      name = this.name?.value.trim() ?? '';
    if (!spec) return void this.alert?.setText(word('maker.none-yet'));
    if (!/^\w+$/.test(name)) return void this.alert?.setText(word('maker.bad-name'));
    // the core makes the block, or says why not: a graph or a kind whose name a view query cannot hold; nothing is then
    // written. Writing it checks it against the note as it is then: a thing only suggested there is refused (§4)
    const made = makeView(this.o.graph, name, spec);
    if ('refused' in made) return void this.alert?.setText(made.refused);
    const refused = await this.o.writeView?.(made.block);
    if (refused) return void this.alert?.setText(refused);
    this.making = false;
    this.show();
  }
}
