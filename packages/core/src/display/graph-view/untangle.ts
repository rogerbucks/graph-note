// Untangling a large graph in a card (editor spec §25, slice 3), tied to the core's `Untangle`. It covers a thing and
// its neighbours alone, the legend, the shortest path between two things and the search box. It holds only what the
// drawing shows and says it in a banner. The card marks the drawing from `layers`. Nothing here reaches the note
// (untangle_data_untouched). So none of it is gated for reading view: it changes the picture, never the data. Only the
// legend's choices are ever written, by a view's Save as shown (view-strip.ts), which is gated. A view saved so starts
// with them (untangle_legend).
import { Untangle, find, kindLegend, neighbourhood, neighbourhoodWords, pathWords, word } from '@thoughtknot/core';
import type { FocusDepth, FocusEdge, Kept, Layers, GraphDrawing, LegendChoice, NoteReading } from '@thoughtknot/core';
import { Banner } from './untangle-banner';
import type { BannerRow } from './untangle-banner';
import { renderFind } from './untangle-find';
import type { FindRow } from './untangle-find';
import { renderLegend } from './untangle-legend';
import type { LegendPanel } from './untangle-legend';

/** What untangling asks of its card. */
export interface UntangleHost {
  drawing: GraphDrawing;
  reading: NoteReading;
  graph: string;
  /** How many steps out the setting for focus reaches. */
  depth: () => FocusDepth;
  /** Tells the card the picture may have changed, so it marks the drawing again. */
  changed: () => void;
  /** Selects a thing and brings it into view, as opening its details does. */
  go: (key: string) => void;
  /** The legend's choices a view was saved as shown with, to start with (§25, untangle_legend); none for any other. */
  legend?: readonly LegendChoice[];
  /**
   * Lays the graph out again with only a thing and its neighbours, so they sit together, or the whole graph (null). A
   * card that cannot lay out again, such as a table, has none: there the rest is only hidden (untangle_regroup).
   */
  regroup?: (only: Kept | null) => void;
}

/** What the details of a thing offer, which the card gives them. */
export interface ThingActions {
  /** Shows only a thing and its neighbours; pressed again for the same thing, the whole graph (untangle_toggle). */
  showOnly: (key: string) => void;
  /** The thing the drawing shows only with its neighbours now; null for the whole graph. */
  shownOnly?: () => string | null;
  routeFrom: (key: string) => void;
  /** A busy hub's links and whether they are folded now (§25, untangle_hubs); null for another thing. */
  hub?: (key: string) => { links: number; folded: boolean } | null;
  /** Folds a busy hub's links into their stub, or opens them, and draws the graph again. */
  toggleHub?: (key: string) => void;
}

/** The untangling of one card: the core's state, the banner, the legend panel and the search row. */
export class UntangleView {
  private readonly core: Untangle;
  private readonly banner: Banner;
  private readonly legend: LegendPanel;
  private readonly finder: FindRow;
  private readonly host: UntangleHost;
  private readonly names: Map<string, string>;
  private asking: string | null = null;
  /** The thing and steps the drawing was last regrouped to, so it is laid out again only when they change. */
  private regrouped = '';
  /** The bar's button that opens the search row, which Escape in the row gives the focus back to. */
  private findButton: HTMLElement | null = null;

  /** Builds the legend panel, the search row and the banner at the end of what the card has so far. */
  constructor(root: HTMLElement, host: UntangleHost) {
    this.host = host;
    this.core = new Untangle(host.drawing, host.legend);
    this.names = new Map(host.drawing.boxes.map((b) => [b.key, b.text]));
    this.finder = renderFind(root, {
      search: (q) => find(host.reading, host.graph, q),
      choose: (f) => {
        // a thing hidden by a filter would be chosen out of sight: show the whole graph first
        if (this.core.layers(null).hidden.things.has(f.key)) this.reset();
        host.go(f.key);
      },
      close: () => this.closeFind(),
    });
    this.legend = renderLegend(root, kindLegend(host.drawing), this.core.legend, () => host.changed());
    this.banner = new Banner(root);
  }

  /** What the legend brings forward and hides now, as a view saved as shown keeps it. */
  legendChoices(): LegendChoice[] {
    return this.core.legend.choices();
  }

  /** The links of the drawing as the core numbers them. */
  get edges(): FocusEdge[] {
    return this.core.edges;
  }

  /** What to bring forward and what to hide, given what the selection keeps (null for no selection). */
  layers(focus: Kept | null): Layers {
    return this.core.layers(focus);
  }

  /** Opens or closes the search row (the bar's button), the cursor in its box on opening. */
  toggleFind(b: HTMLElement): void {
    this.findButton = b;
    this.finder.el.hidden = !this.finder.el.hidden;
    b.setAttribute('aria-expanded', String(!this.finder.el.hidden));
    if (!this.finder.el.hidden) this.finder.focus();
  }

  /** Closes the search row, as Escape in its box does, and gives the focus back to the button that opened it. */
  private closeFind(): void {
    this.finder.el.hidden = true;
    this.findButton?.setAttribute('aria-expanded', 'false');
    this.findButton?.focus();
  }

  /** Opens or closes the legend panel (the bar's button). */
  toggleLegend(b: HTMLElement): void {
    this.legend.el.hidden = !this.legend.el.hidden;
    b.setAttribute('aria-expanded', String(!this.legend.el.hidden));
  }

  /**
   * Filters the drawing to a thing and what lies within the setting's steps of it. Asked again for the same thing, it
   * shows the whole graph again: the button is a toggle (untangle_toggle).
   */
  showOnly(key: string): void {
    if (this.core.only?.key === key) this.core.showAll();
    else this.core.showOnly(key, this.host.depth());
    this.changed();
  }

  /** The thing the drawing shows only with its neighbours now; null for the whole graph. */
  shownOnly(): string | null {
    return this.core.only?.key ?? null;
  }

  /** Asks for a second thing, to bring forward the shortest path from this one to it. */
  routeFrom(key: string): void {
    this.core.clearRoute();
    this.asking = key;
    this.changed();
  }

  /** Whether the card is waiting for the second thing of a path. */
  picking(): boolean {
    return this.asking !== null;
  }

  /** The answer to that question: the path to this thing. False when no question was asked. */
  pick(key: string): boolean {
    const from = this.asking;
    if (from === null) return false;
    if (key !== from) this.routeBetween(from, key);
    return true;
  }

  /** Brings forward the shortest path between two things, or says there is none. */
  routeBetween(from: string, to: string): void {
    this.asking = null;
    this.core.route(from, to);
    this.changed();
  }

  /** Drops a question waiting for a second thing; true when there was one, so Escape is used for that and no more. */
  cancel(): boolean {
    if (this.asking === null) return false;
    this.asking = null;
    this.changed();
    return true;
  }

  /** Puts everything back as it was drawn: the whole graph, the legend clear, no path and no question. */
  reset(): void {
    this.core.showAll();
    this.core.legend.reset();
    this.core.clearRoute();
    this.asking = null;
    this.legend.refresh();
    this.changed();
  }

  private text(key: string): string {
    return this.names.get(key) ?? key;
  }

  private changed(): void {
    this.banner.show(this.rows());
    this.host.changed();
    // a thing and its neighbours are laid out together; the whole graph, as it was (untangle_regroup)
    const only = this.core.only,
      now = only ? `${only.steps} ${only.key}` : '';
    if (now === this.regrouped) return;
    this.regrouped = now;
    this.host.regroup?.(only ? neighbourhood(this.edges, only.key, only.steps) : null);
  }

  private rows(): BannerRow[] {
    const rows: BannerRow[] = [],
      only = this.core.only,
      routed = this.core.routed;
    if (only) {
      const wider = only.steps === 1;
      rows.push({
        words: neighbourhoodWords(this.text(only.key), only.steps),
        actions: [
          {
            label: word('untangle.show-all'),
            run: () => {
              this.core.showAll();
              this.changed();
            },
          },
          {
            label: wider ? word('untangle.widen') : word('untangle.narrow'),
            run: () => {
              this.core.showOnly(only.key, wider ? 2 : 1);
              this.changed();
            },
          },
        ],
      });
    }
    if (routed)
      rows.push({
        words: pathWords((k) => this.text(k), routed.from, routed.to, routed.found),
        actions: [
          {
            label: word('untangle.clear-path'),
            run: () => {
              this.core.clearRoute();
              this.changed();
            },
          },
        ],
      });
    if (this.asking !== null)
      rows.push({
        words: word('untangle.choose-second', { name: this.text(this.asking) }),
        actions: [{ label: word('untangle.cancel'), run: () => void this.cancel() }],
      });
    return rows;
  }
}
