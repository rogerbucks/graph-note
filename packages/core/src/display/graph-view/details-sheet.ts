// The details of a card in view mode as a sheet (editor spec §25, slice 3). It is pinned over the card, to the part of
// the screen the note is seen in. So it stays in place while the note scrolls (sheet_pinned), and hides while the card
// is off the screen.
// - Where it sits is chosen from the place button in its header: the bottom, the default, the top or either side
//   (sheet_docked). In a host with side panes of its own, such as Obsidian's sidebars, it can also go into one
//   (details_in_host_pane). There it is the inspector too, while the block is edited.
// - Its edge facing the drawing is a resize bar, dragged or moved with the arrow keys (sheet_resized).
// - A toggle in its header minimises it to a bar with the thing's name and kind. The toggle also restores the full
//   details, scrolling within itself and never filling the screen (sheet_min_max).
// - What was last chosen holds for the session and across restarts (sheet_state_remembered, sheet_layout_kept).
// - Escape in it closes it (sheet_closed). It says what it covers, so the card keeps the chosen thing clear of it
//   (sheet_keeps_thing_clear). Its keys are its own: nothing typed in the note is taken.
// While the block is edited, the details are the inspector, in the card or the side pane.
import { setIcon, sidePane } from '../host';
import { coverOf, sheetBounds, sheetSpan, sideways, word, type Clear, type SheetDock } from '@thoughtknot/core';
import { screenOf } from './placement';
import { SheetResizer } from './sheet-resizer';
import { InPane, choose, keepChosen, placeButton, placeMenu, readKept, remembered, sideOf } from './details-place';
import type { DetailsPlace, SheetState } from './details-place';

/** What the sheet asks of its details. */
export interface SheetHost {
  /** Whether the details are the sheet now: in view mode, in a note's card. */
  on: () => boolean;
  /** Whether the details may go into the host's side pane now: in a note's card, in view mode or while edited. */
  paneable: () => boolean;
  /** Closes the details, as their close button does, and the selection with them. */
  close: () => void;
  /** The sheet opened or changed size or place: the card keeps the chosen thing clear of it. */
  moved: () => void;
  /** Draws the open details again, in their new place; false when there are none to draw again. */
  redraw: () => boolean;
}

/**
 * Whether a key was pressed in a field being typed in, which is never taken from it. That is a form field, or text the
 * nearest contenteditable says is editable. In Live Preview the card is a widget CodeMirror marks not editable inside
 * its editable content. So a key in the card is the card's.
 */
function typing(t: EventTarget | null): boolean {
  const el = t as Element | null;
  if (el?.closest?.('input, textarea, select')) return true;
  const editable = el?.closest?.('[contenteditable]')?.getAttribute('contenteditable');
  return editable === 'true' || editable === '' || editable === 'plaintext-only';
}

/** Where a sheet pinned to the screen would not be seen as the sheet: a canvas card, and a hover preview. */
const ELSEWHERE = '.canvas-node, .hover-popover';

/** How far, in pixels, the sheet may be laid out from where it was put before it is taken not to be pinned there. */
const PLACED_WITHIN = 1;

/** The class each place gives the sheet, so the style sheet lays it out there. */
const DOCK_CLASSES = ['is-dock-bottom', 'is-dock-top', 'is-dock-left', 'is-dock-right'];

/** The sheet the details of one card are shown in, in view mode. */
export class DetailsSheet {
  private readonly el: HTMLElement;
  private readonly host: SheetHost;
  private toggle: HTMLButtonElement | null = null;
  private body: HTMLElement | null = null;
  private grip: SheetResizer | null = null;
  private watcher: IntersectionObserver | null = null;
  /** Watches the card's size while the sheet is open, so the sheet is placed again when it changes. */
  private sizer: ResizeObserver | null = null;
  /** The details in the host's side pane, when they are there, and where they go back to. */
  private readonly pane: InPane;

  /** For the details element of a card, which sits in the card. */
  constructor(el: HTMLElement, host: SheetHost) {
    this.el = el;
    this.host = host;
    this.pane = new InPane(el);
    readKept();
    el.addEventListener('keydown', (e: KeyboardEvent) => this.key(e));
  }

  /** Whether the details are in the host's side pane now. */
  inPane(): boolean {
    return this.pane.on();
  }

  /** Whether the details are to go into the host's side pane: chosen, offered by the host, and allowed by the card. */
  private paneWanted(): boolean {
    return remembered.place === 'pane' && this.paneOffered();
  }

  /** Whether the host has a side pane to offer, and the card may use it. */
  private paneOffered(): boolean {
    return !!sidePane() && this.host.paneable() && (this.inPane() || !this.el.closest(ELSEWHERE));
  }

  /** Whether the details are to be the sheet: as the host says, but never in the side pane, a canvas card or a hover preview. */
  private wanted(): boolean {
    return this.host.on() && !this.paneWanted() && !this.inPane() && !this.el.closest(ELSEWHERE);
  }

  /** The card the details belong to: where they sit, or sat before they went into the side pane. */
  private card(): HTMLElement {
    return this.pane.card() ?? this.el.parentElement ?? this.el;
  }

  /** Where the sheet sits now, never the pane. */
  private dock(): SheetDock {
    return remembered.place === 'pane' ? 'bottom' : remembered.place;
  }

  /** The side the sheet is seen on, at a side; null at the bottom or top. */
  private side(dock: SheetDock = this.dock()): 'left' | 'right' | null {
    return sideOf(dock);
  }

  /**
   * Puts the header's own buttons in a new set of details' header, before its close button. The place button shows
   * wherever there is a choice of place: as the sheet, or with a side pane offered. The toggle shows on the sheet.
   */
  head(head: HTMLElement): void {
    this.toggle = null;
    const sheet = this.wanted();
    if (sheet || this.paneOffered()) {
      const p = placeButton(head);
      p.addEventListener('click', () =>
        placeMenu(p, {
          now: this.inPane() ? 'pane' : remembered.place,
          docks: this.host.on() || this.inPane(),
          pane: this.paneOffered(),
          go: (place) => this.go(place),
        }),
      );
    }
    if (!sheet) return;
    const t = head.createEl('button', {
      cls: ['clickable-icon', 'thoughtknot-sheet-toggle'],
      attr: { type: 'button' },
    });
    t.addEventListener('click', () => this.set(this.el.hasClass('is-minimised') ? 'restored' : 'minimised'));
    this.toggle = t;
  }

  /** Moves the open details to `place`, remembered for every set opened after, and keeps the chosen thing clear. */
  private go(place: DetailsPlace): void {
    choose({ place });
    if (!this.host.redraw() && this.body) this.opened(this.body);
    this.host.moved();
  }

  /**
   * A new set of details is open, `body` below its header. It goes into the side pane where that is chosen. Otherwise
   * it shows as the sheet, pinned, sized and in the state last chosen. Where it cannot be pinned, it shows in the card.
   */
  opened(body: HTMLElement): void {
    this.body = body;
    if (this.paneWanted()) return this.toPane();
    this.pane.back();
    const on = this.wanted();
    this.el.toggleClass('thoughtknot-sheet', on);
    if (!on) return this.inCard();
    this.grip?.remove();
    this.grip = new SheetResizer(this.el, {
      dock: () => this.dock(),
      side: () => this.side(),
      across: () => this.across(),
      span: () => this.span(),
      resize: (px) => this.resize(px),
      done: keepChosen,
    });
    if (!this.place()) return this.inCard();
    this.apply(remembered.state);
    this.watch();
  }

  /** The details go into the host's side pane, or show again there: no sheet, and the whole of them. */
  private toPane(): void {
    if (!sidePane()) return this.inCard();
    this.unwatch();
    this.el.removeClass('thoughtknot-sheet', 'is-minimised', 'is-away', 'is-sheet', ...DOCK_CLASSES);
    this.grip?.remove();
    this.grip = null;
    if (this.body) this.body.hidden = false;
    // left without being asked: closed by the person, the sheet is the place again; or taken by another card's
    this.pane.show((why) => {
      if (why === 'closed') choose({ place: 'bottom' });
      this.host.close();
    });
  }

  /**
   * The window changed size (`resized`), or the note scrolled. The open sheet is placed again over its card. When its
   * size may have changed, the card keeps the chosen thing clear of it.
   */
  moved(resized: boolean): void {
    // away with its card, the sheet is not laid out at all (display: none): it is placed when the card comes back
    if (this.el.hidden || !this.el.hasClass('thoughtknot-sheet') || this.el.hasClass('is-away')) return;
    if (!this.place()) return this.inCard();
    if (resized) this.host.moved();
  }

  /** Stops watching the card. */
  private unwatch(): void {
    this.watcher?.disconnect();
    this.watcher = null;
    this.sizer?.disconnect();
    this.sizer = null;
  }

  /** The details closed, or are no longer the sheet: nothing is pinned or watched, and they leave the side pane. */
  closed(): void {
    this.unwatch();
    this.el.removeClass('thoughtknot-sheet', 'is-minimised', 'is-away', ...DOCK_CLASSES);
    this.grip?.remove();
    this.grip = null;
    this.pane.back();
  }

  /** The details shown in the card, not as the sheet: no toggle, and the whole of them. */
  private inCard(): void {
    this.closed();
    this.toggle?.remove();
    this.toggle = null;
    if (this.body) this.body.hidden = false;
  }

  /** Whether the sheet is shown and laid out over its card now. */
  private shown(): boolean {
    return !this.el.hidden && this.el.hasClass('thoughtknot-sheet') && !this.el.hasClass('is-away');
  }

  /**
   * Where the sheet's top is on the screen, when it sits at the bottom. Null when there is no such sheet to keep clear
   * of. That is when it is closed, not a sheet, elsewhere, away with its card, or not yet laid out. A sheet never
   * reaches the top of the screen it is pinned in.
   */
  top(): number | null {
    if (!this.shown() || this.dock() !== 'bottom') return null;
    const top = this.el.getBoundingClientRect().top;
    return top > screenOf(this.el).top ? top : null;
  }

  /** How much of `viewport`, a rectangle on the screen, the sheet covers at each of its edges; nothing when not shown. */
  cover(viewport: DOMRect): Clear {
    const none = { top: 0, right: 0, bottom: 0, left: 0 };
    if (!this.shown()) return none;
    const s = this.el.getBoundingClientRect(),
      within = (n: number, most: number) => Math.min(most, Math.max(0, n));
    if (s.width <= 0 || s.height <= 0) return none;
    switch (this.side() ?? this.dock()) {
      case 'bottom': {
        const top = this.top();
        return { ...none, bottom: top === null ? 0 : coverOf(viewport, top) };
      }
      case 'top':
        return { ...none, top: within(s.bottom - viewport.top, viewport.height) };
      case 'left':
        return { ...none, left: within(s.right - viewport.left, viewport.width) };
      default:
        return { ...none, right: within(viewport.right - s.left, viewport.width) };
    }
  }

  /** Minimises or restores the sheet, remembered for every sheet opened after, and keeps the chosen thing clear again. */
  private set(state: SheetState): void {
    choose({ state });
    this.apply(state);
    this.place();
    this.host.moved();
  }

  /** Shows the sheet minimised, its body and resize bar hidden, or restored, with its toggle saying what it will do. */
  private apply(state: SheetState): void {
    const min = state === 'minimised';
    this.el.toggleClass('is-minimised', min);
    if (this.body) this.body.hidden = min;
    if (this.grip) this.grip.el.hidden = min;
    const t = this.toggle;
    if (!t) return;
    t.empty();
    setIcon(t, min ? 'chevron-up' : 'chevron-down');
    t.setAttribute('aria-label', word(min ? 'details.restore' : 'details.minimise'));
    t.setAttribute('aria-expanded', String(!min));
  }

  /** How far the sheet's size is measured across: the note's visible height at the bottom or top, the card's width at a side. */
  private across(): number {
    const screen = screenOf(this.el);
    return sideways(this.dock()) ? this.card().getBoundingClientRect().width : screen.bottom - screen.top;
  }

  /** The size chosen for the sheet where it sits, as a share of the screen across it; null until resized. */
  private share(): number | null {
    return sideways(this.dock()) ? remembered.across : remembered.up;
  }

  /** How big the sheet is across the screen where it sits, in pixels. */
  private span(): number {
    return sheetSpan(this.dock(), this.share(), this.across());
  }

  /**
   * Sizes the sheet to `px` across the screen, within its bounds, remembered for every sheet opened after. Then places
   * it again, and the card keeps the chosen thing clear.
   */
  private resize(px: number): void {
    const across = this.across();
    if (across <= 0) return;
    const { least, most } = sheetBounds(this.dock(), across),
      share = Math.min(most, Math.max(least, px)) / across;
    if (sideways(this.dock())) remembered.across = share;
    else remembered.up = share;
    this.place();
    this.host.moved();
  }

  /**
   * Pins the sheet over its card, where it sits, and sizes it.
   * - At the bottom it sits at the foot of the part of the screen the note is seen in, as wide as the card. When the
   *   card ends above that foot, it sits at the foot of the card. So the note below the card, and its caret, are never
   *   covered.
   * - At the top it sits at the top of that part, or of the card where the card begins below it.
   * - At a side it runs from that top to that foot, along the card's left or right edge.
   * Then checks the browser laid it out there. Inside a container that moves fixed things, as a transform does, it is
   * not, and false says so.
   */
  private place(): boolean {
    const card = this.card().getBoundingClientRect(),
      screen = screenOf(this.el),
      height = this.el.win.innerHeight,
      below = Math.max(screen.below, height - Math.min(card.bottom, screen.bottom)),
      top = Math.max(screen.top, card.top),
      dock = this.dock(),
      side = this.side(dock),
      across = this.across(),
      span = this.span(),
      min = this.el.hasClass('is-minimised');
    this.el.removeClass(...DOCK_CLASSES);
    this.el.addClass(`is-dock-${side ?? dock}`);
    const left = side === 'right' ? card.left + card.width - span : card.left,
      width = side ? span : card.width,
      atFoot = dock === 'bottom' || (!!side && !min),
      atTop = dock !== 'bottom';
    const px = (n: number) => `${n}px`;
    this.el.setCssProps({
      '--thoughtknot-sheet-left': px(left),
      '--thoughtknot-sheet-width': px(width),
      '--thoughtknot-sheet-bottom': atFoot ? px(below) : '',
      '--thoughtknot-sheet-top': atTop ? px(top) : '',
      '--thoughtknot-sheet-max': side ? '' : px(span),
      // the size set, whatever its details hold: they scroll within it, so it never jumps as they change
      '--thoughtknot-sheet-height': !side && !min ? px(span) : '',
    });
    this.grip?.say(span, across);
    const laid = this.el.getBoundingClientRect();
    return (
      Math.abs(laid.left - left) <= PLACED_WITHIN &&
      Math.abs(laid.width - width) <= PLACED_WITHIN &&
      (!atFoot || Math.abs(laid.bottom - (height - below)) <= PLACED_WITHIN) &&
      (!atTop || Math.abs(laid.top - top) <= PLACED_WITHIN)
    );
  }

  /**
   * Hides the sheet while its card is off the screen, and shows it again when the card comes back. When the card
   * changes size, it places the sheet again, keeping the chosen thing clear.
   */
  private watch(): void {
    const card = this.el.parentElement;
    if (!card) return;
    if (!this.watcher && typeof IntersectionObserver !== 'undefined') {
      this.watcher = new IntersectionObserver((seen) => {
        const back = seen.some((s) => s.isIntersecting),
          was = this.el.hasClass('is-away');
        this.el.toggleClass('is-away', !back);
        if (back && was) this.moved(true); // placed again where the card is now, the chosen thing kept clear
      });
      this.watcher.observe(card);
    }
    if (!this.sizer && typeof ResizeObserver !== 'undefined') {
      this.sizer = new ResizeObserver(() => this.moved(true));
      this.sizer.observe(card);
    }
  }

  /** Escape in the sheet closes it, but never in a field being typed in. */
  private key(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    if (!this.el.hasClass('thoughtknot-sheet') || this.el.hidden) return;
    e.preventDefault();
    this.host.close();
  }
}
