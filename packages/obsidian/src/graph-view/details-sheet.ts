// The details of a card in view mode as a sheet (editor spec §25, slice 3): pinned to the foot of the part of the screen
// the note is seen in, over the card and as wide as it, so it stays in place while the note scrolls (sheet_pinned),
// hidden while the card is off the screen; a toggle in its header minimises it to a bar with the thing's name and kind,
// or restores the full details, scrolling within itself and never filling the screen (sheet_min_max), in the state last
// chosen for the rest of the session (sheet_state_remembered); Escape in it closes it (sheet_closed). It says how much
// of the drawing it covers, so the card can keep the chosen thing clear above it (sheet_keeps_thing_clear). Its keys are
// its own: nothing typed in the note is taken. While the block is edited, the details are the inspector, in the card.
import { setIcon } from 'obsidian';
import { sheetLimit } from '@graph-note/core';
import { screenOf } from './placement';

/** Minimised to a bar, or restored to the full details. */
export type SheetState = 'restored' | 'minimised';

/** The state last chosen, which every sheet opens in for the rest of the session: the plugin's, until it is reloaded. */
let remembered: SheetState = 'restored';

/** What the sheet asks of its details. */
export interface SheetHost {
  /** Whether the details are the sheet now: in view mode, in a note's card. */
  on: () => boolean;
  /** Closes the details, as their close button does, and the selection with them. */
  close: () => void;
  /** The sheet opened or changed size: the card keeps the chosen thing clear above it. */
  moved: () => void;
}

/** Whether a key was pressed in a field being typed in, which is never taken from it. */
const typing = (t: EventTarget | null): boolean =>
  !!(t as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"]');

/** The sheet the details of one card are shown in, in view mode. */
export class DetailsSheet {
  private readonly el: HTMLElement;
  private readonly host: SheetHost;
  private toggle: HTMLButtonElement | null = null;
  private body: HTMLElement | null = null;
  private watcher: IntersectionObserver | null = null;

  /** For the details element of a card, which sits in the card. */
  constructor(el: HTMLElement, host: SheetHost) {
    this.el = el;
    this.host = host;
    el.addEventListener('keydown', (e: KeyboardEvent) => this.key(e));
  }

  /** Puts the toggle in a new set of details' header, before its close button, when the details are the sheet. */
  head(head: HTMLElement): void {
    this.toggle = null;
    if (!this.host.on()) return;
    const t = head.createEl('button', { cls: ['clickable-icon', 'graph-note-sheet-toggle'], attr: { type: 'button' } });
    t.addEventListener('click', () => this.set(this.el.hasClass('is-minimised') ? 'restored' : 'minimised'));
    this.toggle = t;
  }

  /** A new set of details is open, `body` below its header: as the sheet, pinned, sized and in the state last chosen. */
  opened(body: HTMLElement): void {
    this.body = body;
    const on = this.host.on();
    this.el.toggleClass('graph-note-sheet', on);
    if (!on) return this.closed();
    this.place();
    this.apply(remembered);
    this.watch();
  }

  /** The details closed, or are no longer the sheet: nothing is pinned or watched. */
  closed(): void {
    this.watcher?.disconnect();
    this.watcher = null;
    this.el.removeClass('graph-note-sheet', 'is-minimised', 'is-away');
  }

  /**
   * Where the sheet's top is on the screen, or null when there is no sheet to keep clear of: closed, not a sheet, away with
   * its card, or not yet laid out (a sheet never reaches the top of the screen it is pinned in).
   */
  top(): number | null {
    if (this.el.hidden || !this.el.hasClass('graph-note-sheet') || this.el.hasClass('is-away')) return null;
    const top = this.el.getBoundingClientRect().top;
    return top > screenOf(this.el).top ? top : null;
  }

  /** Minimises or restores the sheet, remembered for every sheet opened after, and keeps the chosen thing clear again. */
  private set(state: SheetState): void {
    remembered = state;
    this.apply(state);
    this.host.moved();
  }

  /** Shows the sheet minimised, its body hidden, or restored, with its toggle saying what it will do. */
  private apply(state: SheetState): void {
    const min = state === 'minimised';
    this.el.toggleClass('is-minimised', min);
    if (this.body) this.body.hidden = min;
    const t = this.toggle;
    if (!t) return;
    t.empty();
    setIcon(t, min ? 'chevron-up' : 'chevron-down');
    t.setAttribute('aria-label', min ? 'Restore details' : 'Minimise details');
    t.setAttribute('aria-expanded', String(!min));
  }

  /** Pins the sheet over its card, as wide as it, at the foot of the part of the screen the note is seen in, and sizes it. */
  private place(): void {
    const card = (this.el.parentElement ?? this.el).getBoundingClientRect(),
      screen = screenOf(this.el);
    this.el.setCssProps({
      '--graph-note-sheet-left': `${card.left}px`,
      '--graph-note-sheet-width': `${card.width}px`,
      '--graph-note-sheet-bottom': `${screen.below}px`,
      '--graph-note-sheet-max': `${sheetLimit(screen.bottom - screen.top)}px`,
    });
  }

  /** Hides the sheet while its card is off the screen, and shows it again when the card comes back. */
  private watch(): void {
    const card = this.el.parentElement;
    if (this.watcher || !card || typeof IntersectionObserver === 'undefined') return;
    this.watcher = new IntersectionObserver((seen) => {
      this.el.toggleClass('is-away', !seen.some((s) => s.isIntersecting));
    });
    this.watcher.observe(card);
  }

  /** Escape in the sheet closes it, but never in a field being typed in. */
  private key(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    if (!this.el.hasClass('graph-note-sheet') || this.el.hidden) return;
    e.preventDefault();
    this.host.close();
  }
}
