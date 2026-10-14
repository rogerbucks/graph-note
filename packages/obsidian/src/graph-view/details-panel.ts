// A drawing's details on demand (spec §3, §14): what tapping a box, a link or an estimated link shows — its words, the
// things at either end or its links in and out, grouped by type and direction in words (§25), its properties and its
// problems — with the one shown marked as selected; and, while the block is edited in place, the inspector, which
// changes its properties in the text. What its links reach can be chosen from it, and the walk retraced (§25); in view
// mode, in a note's card, it is the sheet pinned to the foot of the screen (details-sheet.ts).
import { Platform } from 'obsidian';
import { Trail, details, linkDetails, linkGroups, linkInBlock, propertiesOf } from '@graph-note/core';
import type { Estimate, TrailStep } from '@graph-note/core';
import { renderProperties } from '../properties/properties';
import { problemText } from './problems-list';
import { showSuggested } from './suggested-name';
import { parkButton, parkedNote } from './parked';
import { estimateActions } from './estimate-actions';
import { button } from './view-bar';
import { linkWords, renderLinkGroups, renderTrail, stepName, thingButton } from './details-nav';
import type { NavActions } from './details-nav';
import { DetailsSheet } from './details-sheet';
import { RichDetails } from './rich-details';
import type { ThingActions } from './untangle';
import type { ViewOptions } from './view-options';
import type { View } from '@graph-note/core';
import type { LeftAt } from '../links/link-host';

/** The details of one drawing, shown in its card below the drawing, or in view mode as the sheet. */
export class DetailsPanel {
  private readonly el: HTMLElement;
  /** The drawing: Graphviz's SVG, or the table a graph drawn as one is (§15). */
  private readonly svg: Element;
  private readonly viewport: HTMLElement;
  private readonly o: ViewOptions;
  private readonly actions: (ThingActions & NavActions) | undefined;
  /** The box or link whose details are open, so they can be drawn again when editing ends. */
  private shown: { key: string } | { link: number } | null = null;
  /** The things and links chosen from the details, to retrace (details_trail). */
  private readonly trail = new Trail();
  /** Set while the details are drawn for a step of the trail, or drawn again: the trail goes on rather than starting again. */
  private walking = false;
  private readonly sheet: DetailsSheet;
  /** Its text and properties rendered by Obsidian, the note a thing stands for, and its links (§18). */
  private readonly rich: RichDetails;

  /** The drawing's view as it is now, set by the card: where a link that takes the card's tab leaves it (§18). */
  view?: () => View;

  /** The thing whose details are open, if a thing's are: what a view saved as shown keeps as selected (§7). */
  selectedKey(): string | null {
    return this.shown && 'key' in this.shown ? this.shown.key : null;
  }

  /** Where the card is now: its zoom, where it is panned and the thing selected, for the back step (back_where_you_were). */
  private leftAt(): LeftAt | null {
    const v = this.view?.(),
      selected = this.selectedKey();
    return v ? { zoom: v.scale, x: v.x, y: v.y, ...(selected ? { selected } : {}) } : null;
  }

  /** For the details element of a card, its drawing, the viewport the focus goes back to, the card's options and what a thing's details offer. */
  constructor(
    el: HTMLElement,
    svg: Element,
    viewport: HTMLElement,
    o: ViewOptions,
    actions?: ThingActions & NavActions,
  ) {
    this.el = el;
    this.svg = svg;
    this.viewport = viewport;
    this.o = o;
    this.actions = actions;
    this.rich = new RichDetails(o, () => this.leftAt());
    this.sheet = new DetailsSheet(el, {
      // the sheet is for view mode, in a note's card: full screen and the pane show the details in their own place
      on: () => o.mode === 'note' && !o.editing?.()?.session,
      close: () => this.close(),
      moved: () => this.actions?.sheetMoved(),
    });
  }

  /** Where the details sheet's top is on the screen, or null when there is no sheet to keep the chosen thing clear of. */
  sheetTop(): number | null {
    return this.sheet.top();
  }

  /** The window changed size (`resized`), or the note scrolled: the sheet, if open, is placed again. */
  moved(resized: boolean): void {
    this.sheet.moved(resized);
  }

  /** The card is going: the sheet's watchers stop. */
  unload(): void {
    this.sheet.closed();
    this.rich.end();
  }

  /** A thing or link chosen from the details: the next step of the trail, made the selection by the card. */
  private choose(step: TrailStep): void {
    if (this.trail.go(step)) this.step(step);
  }

  /** Shows a step of the trail, which goes on from it rather than starting again. */
  private step(step: TrailStep | null): void {
    if (!step) return;
    this.walking = true;
    try {
      this.actions?.choose(step);
    } finally {
      this.walking = false;
    }
  }

  /** The trail at a new set of details: started again by a thing or link chosen in the drawing; then back and forward. */
  private retrace(body: HTMLElement, at: TrailStep): void {
    if (!this.walking) this.trail.start(at);
    renderTrail(
      body,
      this.trail,
      (s) => stepName(this.o.reading, this.o.graph, s),
      (way) => this.step(way === 'back' ? this.trail.back() : this.trail.forward()),
    );
  }

  /**
   * Marks the box, link or estimated link whose details are open — a heavier line, and pressed for screen readers — and
   * only that one.
   */
  private select(key: string | null, link: number | null = null, estimate: number | null = null): void {
    for (const g of Array.from(this.svg.querySelectorAll('g.node, g.edge, tr[data-key], tr[data-link]'))) {
      // a thing folded into a group's box (§25) is selected as its box
      const on =
        (key !== null && g.getAttribute('data-key') === key) ||
        (key !== null && (g.getAttribute('data-keys') ?? '').split(' ').includes(key)) ||
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
    this.retrace(el, { link: index });
    // each end is a choice, as a linked thing is in a thing's details (§25)
    const ul = el.createEl('ul', { cls: 'graph-note-link-groups' });
    for (const [label, end] of [
      ['From', d.from],
      ['To', d.to],
    ] as const) {
      const li = ul.createEl('li', { cls: 'graph-note-link-group' });
      li.appendText(`${label}: `);
      thingButton(li, end.text, () => this.choose({ key: end.key }));
    }
    this.readOnlyProperties(el, d.properties);
    this.rich.links(el, { link: index });
    if (d.problems.length) {
      el.createEl('h4', { text: 'Problems' });
      const probs = el.createEl('ul');
      for (const p of d.problems) probs.createEl('li', { text: problemText({ ...p, noteLine: this.o.lineOf(p) }) });
    }
    this.inspector(el, { link: index }, '');
  }

  /**
   * A thing's or link's properties, shown to be read, each as name: value, where the inspector is not open to change
   * them: outside edit mode, and in reading view, which shows them and never changes them (spec §3, §14).
   */
  private readOnlyProperties(el: HTMLElement, properties: [string, string][]): void {
    if (!properties.length || this.o.editing?.()?.session) return;
    this.rich.properties(el, properties); // each value rendered by Obsidian, as in a note (§18, rich_details)
  }

  /**
   * The details panel, emptied and shown, with a header — the heading, in view mode the sheet's toggle, and a close button
   * — and a body below it, which is returned for the details.
   */
  private panel(title: string, kind?: string): HTMLElement {
    const el = this.el;
    this.rich.begin();
    el.empty();
    el.hidden = false;
    el.setAttribute('aria-label', `Details of ${title}`);
    el.toggleClass('is-sheet', Platform.isPhone && !!this.o.editing?.()?.session); // the inspector, on a phone: a bottom sheet (§14)
    const head = el.createDiv({ cls: 'graph-note-details-head' });
    head.createEl('strong', { text: title });
    if (kind) head.createSpan({ cls: 'graph-note-kind', text: kind });
    this.sheet.head(head);
    button(head, 'Close details', 'x', () => this.close());
    const body = el.createDiv({ cls: 'graph-note-details-body' });
    this.sheet.opened(body);
    return body;
  }

  /** Closes the details and clears what is selected, as the close button does, and tells the card (§25): the focus clears too. */
  close(): void {
    this.el.hidden = true;
    this.shown = null;
    this.trail.clear();
    this.sheet.closed();
    this.rich.end();
    this.select(null);
    this.viewport.focus();
    const ed = this.o.editing?.();
    if (ed) ed.selected = null;
    this.onClosed?.();
  }

  /** Called when the details are closed, by the button, Escape or a tap on empty space. */
  onClosed?: () => void;

  /**
   * Draws open details again when editing starts or ends: the inspector is for edit mode only (spec §14), so what is open
   * becomes the editable inspector while the card is edited, and the read-only view a tap shows otherwise. Details that
   * are closed stay closed.
   */
  refresh(): void {
    const shown = this.shown;
    if (this.el.hidden || !shown) return;
    this.walking = true; // the same details again: the trail goes on
    try {
      if ('key' in shown) this.showDetails(shown.key);
      else this.showLink(shown.link);
    } finally {
      this.walking = false;
    }
  }

  /**
   * What tapping estimated link `index` shows, selected as any link is: in a sentence, what was written, what it was
   * taken to mean, and the fix; then the quick fix that accepts it, and Edit the link.
   */
  showEstimate(e: Estimate, index: number): void {
    this.select(null, null, index);
    this.shown = null;
    this.trail.clear(); // a guess is no step of a walk
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
    this.retrace(el, { key });
    this.rich.thing(el, key, d.text); // the note it stands for, and its text rendered by Obsidian (§18)
    const links = (title: string, items: string[]) => {
      if (!items.length) return;
      el.createEl('h4', { text: title });
      const ul = el.createEl('ul');
      for (const i of items) ul.createEl('li', { text: i });
    };
    // its links by relationship type and direction, in words, each thing and link a choice (§25)
    const groups = linkGroups(this.o.reading, this.o.graph, key);
    for (const [title, way] of [
      ['Links out', 'out'],
      ['Links in', 'in'],
    ] as const) {
      const these = groups.filter((g) => g.direction === way);
      if (!these.length) continue;
      el.createEl('h4', { text: title });
      renderLinkGroups(
        el,
        these,
        (n) => linkWords(this.o.reading, this.o.graph, n),
        (s) => this.choose(s),
      );
    }
    if (!groups.length) el.createEl('p', { text: 'No links in or out.' });
    this.untangling(el, key);
    this.readOnlyProperties(
      el,
      propertiesOf(this.o.reading, this.o.graph, { thing: key }).map((p) => [p.key, p.value]),
    );
    this.rich.links(el, { thing: key });
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
        this.o.graph,
        // the fix for a locked graph whose schema lacks Deferred and DEFERS: only while this editor is still open on the
        // card, as for every write here, so a control left from before Done declares nothing
        () =>
          this.o.editing?.() === ed
            ? ed.declareDeferred()
            : Promise.reject(new Error('The block is no longer being edited, so nothing was declared.')),
        // the note as it is now: a thing written in another block is found, and one only suggested is not parked (§4)
        () => ed.session?.current() ?? this.o.reading,
      );
  }

  /**
   * What a thing's details offer to untangle the drawing (§25): its neighbourhood alone, and the shortest path to another
   * thing. A graph drawn as a table (§15) has nothing to hide or bring forward, so there neither is offered.
   */
  private untangling(el: HTMLElement, key: string): void {
    const on = this.actions;
    if (!on || this.o.diagram?.table) return;
    const row = el.createDiv({ cls: 'graph-note-untangle-offers' });
    row
      .createEl('button', { text: 'Show only this and its neighbours', attr: { type: 'button' } })
      .addEventListener('click', () => on.showOnly(key));
    row
      .createEl('button', { text: 'Shortest path to another thing', attr: { type: 'button' } })
      .addEventListener('click', () => on.routeFrom(key));
    // a busy hub's links, folded into one stub or open, folded or opened from its details too (§25, untangle_hubs)
    const hub = on.hub?.(key);
    if (hub)
      row
        .createEl('button', {
          text: `${hub.folded ? 'Open' : 'Fold'} its ${hub.links} links`,
          attr: { type: 'button' },
        })
        .addEventListener('click', () => on.toggleHub?.(key));
  }

  /** The drawing was laid out again (§25): the box or link whose details are open is marked as selected on it again. */
  reselect(): void {
    const shown = this.shown;
    if (this.el.hidden || !shown) return;
    if ('key' in shown) this.select(shown.key);
    else this.select(null, shown.link);
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
      now: () => ed.session?.current() ?? this.o.reading,
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
