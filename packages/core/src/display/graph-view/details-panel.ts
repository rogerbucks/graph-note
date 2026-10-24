// A drawing's details on demand (spec §3, §14). This is what tapping a box, a link or an estimated link shows. It shows
// its words, the things at either end or its links in and out, its properties and its problems. Links are grouped by
// type and direction in words (§25). The one shown is marked as selected. While the block is edited in place, it is the
// inspector, which changes its properties in the text. What its links reach can be chosen from it, and the walk
// retraced (§25). In view mode, in a note's card, it is the sheet pinned to the foot of the screen (details-sheet.ts).
import { isPhone } from '../host';
import { Trail, details, linkDetails, linkGroups, linkInBlock, propertiesOf, thingSaid, word } from '@thoughtknot/core';
import type { Clear, Estimate, TrailStep } from '@thoughtknot/core';
import { renderProperties } from '../properties/properties';
import { problemText } from './problems-list';
import { showSuggested } from './suggested-name';
import { parkButton, parkedNote } from './parked';
import { estimateActions } from './estimate-actions';
import { button } from '../button';
import { linkWords, reducedMotion, renderInsOuts, renderTrail, stepName, thingButton } from './details-nav';
import type { NavActions } from './details-nav';
import { DetailsSheet } from './details-sheet';
import { RichDetails } from './rich-details';
import { renderSummary } from './details-summary';
import { relabelShowOnly, untangleOffers } from './details-untangle';
import { MovingImages, placePictures, renderImages } from './animated-images';
import type { ThingActions } from './untangle';
import type { ViewOptions } from './view-options';
import type { View } from '@thoughtknot/core';

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
  /** The card's images, a thing's shown in its details and the pictures on its boxes, counted as they move (§18). */
  private readonly images: MovingImages;

  /** The drawing's view as it is now, set by the card: where a link that takes the card's tab leaves it (§18). */
  view?: () => View;

  /** The thing whose details are open, if a thing's are: what a view saved as shown keeps as selected (§7). */
  selectedKey(): string | null {
    return this.shown && 'key' in this.shown ? this.shown.key : null;
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
    this.rich = new RichDetails(
      o,
      () => this.view?.(),
      () => this.selectedKey(),
    );
    // still under reduced motion, as the system asks when the card is drawn (§11)
    this.images = new MovingImages(reducedMotion(activeWindow), o.images);
    this.sheet = new DetailsSheet(el, {
      // the sheet is for view mode, in a note's card. Full screen and the pane show the details in their own place. A
      // panel kept open is in the card, beside or below the drawing, never pinned to the screen (§24)
      on: () => o.mode === 'note' && !o.editing?.()?.session && !o.aids?.detailsOpen,
      paneable: () => o.mode === 'note' && !o.aids?.detailsOpen,
      close: () => this.close(),
      moved: () => this.actions?.sheetMoved(),
      redraw: () => {
        if (this.el.hidden || !this.shown) return false;
        this.refresh();
        return true;
      },
    });
  }

  /** Where the details sheet's top is on the screen, or null when there is no sheet to keep the chosen thing clear of. */
  sheetTop(): number | null {
    return this.sheet.top();
  }

  /** How much of `viewport` the details sheet covers at each of its edges, wherever it sits (§25, sheet_docked). */
  sheetCover(viewport: DOMRect): Clear {
    return this.sheet.cover(viewport);
  }

  /** The window changed size (`resized`), or the note scrolled: the sheet, if open, is placed again. */
  moved(resized: boolean): void {
    this.sheet.moved(resized);
  }

  /** The card is going: the sheet's watchers stop, and its images let go of what they hold. */
  unload(): void {
    this.sheet.closed();
    this.rich.end();
    this.images.release();
  }

  /**
   * The pictures its style draws on the boxes of `svg` (§18), counted as they move with the details' images. Those
   * placed on a drawing before let go first, as a drawing laid out again holds none of them.
   */
  pictures(svg: Element): void {
    this.images.release('boxes');
    placePictures(svg, this.images);
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
    const ul = el.createEl('ul', { cls: 'thoughtknot-link-groups' });
    for (const [label, end] of [
      [word('details.from'), d.from],
      [word('details.to'), d.to],
    ] as const) {
      const li = ul.createEl('li', { cls: 'thoughtknot-link-group' });
      li.appendText(`${label}: `);
      thingButton(li, end.text, () => this.choose({ key: end.key }));
    }
    this.readOnlyProperties(el, d.properties);
    this.rich.links(el, { link: index });
    if (d.problems.length) {
      el.createEl('h4', { text: word('details.problems') });
      const probs = el.createEl('ul');
      for (const p of d.problems) probs.createEl('li', { text: problemText({ ...p, noteLine: this.o.lineOf(p) }) });
    }
    this.inspector(el, { link: index }, '');
  }

  /**
   * A thing's or link's properties, shown to be read, each as name: value. This is where the inspector is not open to
   * change them. That is outside edit mode, and in reading view, which never changes them (spec §3, §14).
   */
  private readOnlyProperties(el: HTMLElement, properties: [string, string][]): void {
    if (!properties.length || this.o.editing?.()?.session) return;
    this.rich.properties(el, properties); // each value rendered by Obsidian, as in a note (§18, rich_details)
  }

  /**
   * The details panel, emptied and shown, with a header and a body below it. The body is returned for the details. The
   * header has the heading, in view mode the sheet's toggle, and a close button.
   */
  private panel(title: string, kind?: string): HTMLElement {
    const el = this.el;
    this.rich.begin();
    this.images.release('details'); // the images of the details shown before let go
    el.empty();
    el.hidden = false;
    el.setAttribute('aria-label', word('details.of', { name: title }));
    el.toggleClass('is-sheet', isPhone() && !!this.o.editing?.()?.session); // the inspector, on a phone: a bottom sheet (§14)
    const head = el.createDiv({ cls: 'thoughtknot-details-head' });
    head.createEl('strong', { text: title });
    if (kind) head.createSpan({ cls: 'thoughtknot-kind', text: kind });
    this.sheet.head(head);
    button(head, word('details.close'), 'x', () => this.close());
    const body = el.createDiv({ cls: 'thoughtknot-details-body' });
    this.sheet.opened(body);
    return body;
  }

  /**
   * The graph's summary, shown while nothing is chosen when the panel is kept open (§24, details_always_visible). It
   * says how many things and links it has, of which kinds, and its problems. Nothing is selected; no trail is begun.
   */
  summary(): void {
    this.shown = null;
    this.trail.clear();
    this.select(null);
    renderSummary(this.panel(word('bar.name', { graph: this.o.graph }), 'summary'), this.o.reading, this.o.graph);
  }

  /** Closes the details and clears what is selected, as the close button does, and tells the card (§25): the focus clears too. */
  close(): void {
    this.el.hidden = true;
    this.images.release('details');
    this.shown = null;
    this.trail.clear();
    this.sheet.closed();
    this.rich.end();
    this.select(null);
    // kept open, the panel goes back to the summary; it is never left empty (§24)
    if (this.o.aids?.detailsOpen) this.summary();
    this.viewport.focus();
    const ed = this.o.editing?.();
    if (ed) ed.selected = null;
    this.onClosed?.();
  }

  /** Called when the details are closed, by the button, Escape or a tap on empty space. */
  onClosed?: () => void;
  /** Picks a thing's box up to move it from the keyboard, as M does (§6, move_box_keyboard); unset when no box moves. */
  onMove?: (key: string) => void;

  /**
   * Draws open details again when editing starts or ends. The inspector is for edit mode only (spec §14). So what is
   * open becomes the editable inspector while the card is edited. Otherwise it becomes the read-only view a tap shows.
   * Details that are closed stay closed.
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
   * What tapping estimated link `index` shows, selected as any link is. First, in a sentence, what was written, what it
   * was taken to mean, and the fix. Then the quick fix that accepts it, and Edit the link.
   */
  showEstimate(e: Estimate, index: number): void {
    this.select(null, null, index);
    this.shown = null;
    this.trail.clear(); // a guess is no step of a walk
    const el = this.panel(word('estimate.title'), word('estimate.kind'));
    el.createEl('p', { text: e.explain.replace(/^Line \d+/, word('estimate.at-line', { line: this.o.lineOf(e) })) });
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
    // what is going on, in a sentence or two, before anything else (details_said)
    el.createEl('p', { cls: 'thoughtknot-details-said', text: thingSaid(this.o.reading, this.o.graph, key) });
    if (!this.o.diagram?.table)
      untangleOffers(el, key, this.actions, this.o.readOnly?.() ? undefined : this.onMove, this.o.diagram, d.text);
    this.rich.thing(el, key, d.text); // the note it stands for, and its text rendered by Obsidian (§18)
    const links = (title: string, items: string[]) => {
      if (!items.length) return;
      el.createEl('h4', { cls: 'thoughtknot-section-label', text: title });
      const ul = el.createEl('ul');
      for (const i of items) ul.createEl('li', { text: i });
    };
    // its links in and out, by relationship type and direction, in words, each thing and link a choice (§25)
    renderInsOuts(
      el,
      linkGroups(this.o.reading, this.o.graph, key),
      (n) => linkWords(this.o.reading, this.o.graph, n),
      (s) => this.choose(s),
    );
    this.readOnlyProperties(
      el,
      propertiesOf(this.o.reading, this.o.graph, { thing: key }).map((p) => [p.key, p.value]),
    );
    this.rich.links(el, { thing: key });
    // the images its properties name, each moving, or still saying why, with its pause and play control (§18)
    renderImages(el, this.o.reading.world[this.o.graph]?.p(key) ?? {}, this.images);
    links(
      word('details.problems'),
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
        // the fix for a locked graph whose schema lacks Deferred and DEFERS. It acts only while this editor is still
        // open on the card, as for every write here. So a control left from before Done declares nothing
        () =>
          this.o.editing?.() === ed ? ed.declareDeferred() : Promise.reject(new Error(word('details.not-declared'))),
        // the note as it is now: a thing written in another block is found, and one only suggested is not parked (§4)
        () => ed.session?.current() ?? this.o.reading,
      );
  }

  /** The drawing is shown only with `only` and its neighbours now, or whole (null): its button says so (untangle_toggle). */
  untangled(only: string | null): void {
    relabelShowOnly(this.el, only);
  }

  /** The drawing was laid out again (§25): the box or link whose details are open is marked as selected on it again. */
  reselect(): void {
    const shown = this.shown;
    if (this.el.hidden || !shown) return;
    if ('key' in shown) this.select(shown.key);
    else this.select(null, shown.link);
  }

  /**
   * The inspector (spec §14). In edit mode, it shows every property of the thing or link, each changed, added or
   * removed. Its value is checked against its type first, then written as text into the block being edited.
   */
  private inspector(el: HTMLElement, target: { thing: string } | { link: number }, kind: string): void {
    const ed = this.o.editing?.();
    if (!ed?.session) return;
    ed.selected = 'thing' in target ? { key: target.thing } : { link: target.link };
    const text = () => ed.session?.text ?? '';
    const replace = (t: string) => this.o.editing?.() === ed && ed.replace(t);
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
      replace,
      lists: (ed.lists ??= []),
    });
    this.rich.noteControls(el, target, text, replace);
  }
}
