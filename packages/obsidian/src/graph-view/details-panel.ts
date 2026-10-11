// A drawing's details on demand (spec §3, §14): what tapping a box, a link or an estimated link shows — its words, the
// things at either end or the links in and out, its properties and its problems — with the one shown marked as
// selected; and, while the block is edited in place, the inspector, which changes its properties in the text.
import { Platform } from 'obsidian';
import { details, linkDetails, linkInBlock } from '@graph-note/core';
import type { Estimate } from '@graph-note/core';
import { renderProperties } from '../properties/properties';
import { problemText } from './problems-list';
import { showSuggested } from './suggested-name';
import { parkButton, parkedNote } from './parked';
import { estimateActions } from './estimate-actions';
import { button } from './view-bar';
import type { ViewOptions } from './view-options';

/** The details of one drawing, shown in its card below the drawing. */
export class DetailsPanel {
  private readonly el: HTMLElement;
  private readonly svg: SVGSVGElement;
  private readonly viewport: HTMLElement;
  private readonly o: ViewOptions;
  /** The box or link whose details are open, so they can be drawn again when editing ends. */
  private shown: { key: string } | { link: number } | null = null;

  /** The thing whose details are open, if a thing's are: what a view saved as shown keeps as selected (§7). */
  selectedKey(): string | null {
    return this.shown && 'key' in this.shown ? this.shown.key : null;
  }

  /** For the details element of a card, its drawing, the viewport the focus goes back to, and the card's options. */
  constructor(el: HTMLElement, svg: SVGSVGElement, viewport: HTMLElement, o: ViewOptions) {
    this.el = el;
    this.svg = svg;
    this.viewport = viewport;
    this.o = o;
  }

  /**
   * Marks the box, link or estimated link whose details are open — a heavier line, and pressed for screen readers — and
   * only that one.
   */
  private select(key: string | null, link: number | null = null, estimate: number | null = null): void {
    for (const g of Array.from(this.svg.querySelectorAll('g.node, g.edge'))) {
      const on =
        (key !== null && g.getAttribute('data-key') === key) ||
        (link !== null && g.getAttribute('data-link') === String(link)) ||
        (estimate !== null && g.getAttribute('data-estimate') === String(estimate));
      g.classList.toggle('is-selected', on);
      if (g.hasAttribute('aria-pressed')) g.setAttribute('aria-pressed', String(on));
    }
  }

  /** What tapping a link shows: its reading, the things at either end, its properties, and any problem on it. */
  showLink(index: number): void {
    const d = linkDetails(this.o.reading, this.o.graph, index);
    if (!d) return;
    this.select(null, index);
    this.shown = { link: index };
    const el = this.panel(`${d.from.text} ${d.reading} ${d.to.text}`, d.type);
    const ul = el.createEl('ul');
    ul.createEl('li', { text: `From: ${d.from.text}` });
    ul.createEl('li', { text: `To: ${d.to.text}` });
    if (d.properties.length && !this.o.editing?.()?.session) {
      el.createEl('h4', { text: 'Properties' });
      const props = el.createEl('ul');
      for (const [k, v] of d.properties) props.createEl('li', { text: `${k}: ${v}` });
    }
    if (d.problems.length) {
      el.createEl('h4', { text: 'Problems' });
      const probs = el.createEl('ul');
      for (const p of d.problems) probs.createEl('li', { text: problemText({ ...p, noteLine: this.o.lineOf(p) }) });
    }
    this.inspector(el, { link: index }, '');
  }

  /** The details panel, emptied and shown, with a heading and a close button. */
  private panel(title: string, kind?: string): HTMLElement {
    const el = this.el;
    el.empty();
    el.hidden = false;
    el.setAttribute('aria-label', `Details of ${title}`);
    el.toggleClass('is-sheet', Platform.isPhone && !!this.o.editing?.()?.session); // the inspector, on a phone: a bottom sheet (§14)
    const head = el.createDiv({ cls: 'graph-note-details-head' });
    head.createEl('strong', { text: title });
    if (kind) head.createSpan({ cls: 'graph-note-kind', text: kind });
    button(head, 'Close details', 'x', () => {
      el.hidden = true;
      this.shown = null;
      this.select(null);
      this.viewport.focus();
      const ed = this.o.editing?.();
      if (ed) ed.selected = null;
    });
    return el;
  }

  /**
   * Draws open details again when editing starts or ends: the inspector is for edit mode only (spec §14), so what is open
   * becomes the editable inspector while the card is edited, and the read-only view a tap shows otherwise. Details that
   * are closed stay closed.
   */
  refresh(): void {
    const shown = this.shown;
    if (this.el.hidden || !shown) return;
    if ('key' in shown) this.showDetails(shown.key);
    else this.showLink(shown.link);
  }

  /**
   * What tapping estimated link `index` shows, selected as any link is: in a sentence, what was written, what it was
   * taken to mean, and the fix; then the quick fix that accepts it, and Edit the link.
   */
  showEstimate(e: Estimate, index: number): void {
    this.select(null, null, index);
    this.shown = null;
    const el = this.panel('⚠ Estimated link', 'a guess, not written');
    el.createEl('p', { text: e.explain.replace(/^Line \d+/, `Line ${this.o.lineOf(e)}`) });
    estimateActions(el, index, this.o);
  }

  /** What tapping a box shows: its text, kind, links in and out, and any problem on it. */
  showDetails(key: string): void {
    const d = details(this.o.reading, this.o.graph, key);
    if (!d) return;
    this.select(key);
    this.shown = { key };
    const el = this.panel(d.text, d.kind);
    const links = (title: string, items: string[]) => {
      if (!items.length) return;
      el.createEl('h4', { text: title });
      const ul = el.createEl('ul');
      for (const i of items) ul.createEl('li', { text: i });
    };
    links(
      'Links out',
      d.out.map((l) => `${l.reading} → ${l.text}`),
    );
    links(
      'Links in',
      d.in.map((l) => `${l.text} ${l.reading} this`),
    );
    if (!d.out.length && !d.in.length) el.createEl('p', { text: 'No links in or out.' });
    links(
      'Problems',
      d.problems.map((p) => problemText({ ...p, noteLine: this.o.lineOf(p) })),
    );
    showSuggested(el, this.o.reading, this.o.graph, d, this.o.editing?.());
    parkedNote(
      el,
      this.o.reading.graphs.get(this.o.graph)?.boxes.find((b) => b.key === key),
    );
    this.inspector(el, { thing: key }, d.kind.split(' · ')[0] ?? '');
    // Park for later writes into the text, so it is offered only while the block is edited (spec §5)
    const ed = this.o.editing?.();
    if (ed?.session)
      parkButton(
        el,
        key,
        () => ed.session?.text ?? '',
        (t) => {
          if (this.o.editing?.() === ed) ed.replace(t);
        },
        this.o.indent ?? 'four',
        this.o.reading.whole[this.o.graph], // a thing written in another block of the graph is found
        () => ed.declareDeferred(), // the fix for a locked graph whose schema lacks Deferred and DEFERS
      );
  }

  /**
   * The inspector (spec §14): in edit mode, every property of the thing or link, each changed, added or removed — its value
   * checked against its type first — written as text into the block being edited.
   */
  private inspector(el: HTMLElement, target: { thing: string } | { link: number }, kind: string): void {
    const ed = this.o.editing?.();
    if (!ed?.session) return;
    ed.selected = 'thing' in target ? { key: target.thing } : { link: target.link };
    const text = () => ed.session?.text ?? '';
    renderProperties(el, {
      reading: this.o.reading,
      graph: this.o.graph,
      target,
      kind,
      text,
      // a link is edited in its own brackets, counted among the links written in the block being edited
      inBlock: () =>
        'thing' in target ? target : { link: linkInBlock(this.o.reading, this.o.graph, target.link, text()) },
      // only while this editor is still open on the card: a control left from before Done reaches nothing
      replace: (t) => {
        if (this.o.editing?.() === ed) ed.replace(t);
      },
      lists: (ed.lists ??= []),
    });
  }
}
