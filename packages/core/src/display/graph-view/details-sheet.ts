// The details of a card in view mode as a sheet (editor spec §25, slice 3): pinned to the foot of the part of the screen
// the note is seen in, over the card and as wide as it, so it stays in place while the note scrolls (sheet_pinned),
// hidden while the card is off the screen; a toggle in its header minimises it to a bar with the thing's name and kind,
// or restores the full details, scrolling within itself and never filling the screen (sheet_min_max), in the state last
// chosen for the rest of the session (sheet_state_remembered); Escape in it closes it (sheet_closed). It says how much
// of the drawing it covers, so the card can keep the chosen thing clear above it (sheet_keeps_thing_clear). Its keys are
// its own: nothing typed in the note is taken. While the block is edited, the details are the inspector, in the card.
import { setIcon } from '../host';
import { sheetLimit, word } from '@graph-note/core';
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

/**
 * Whether a key was pressed in a field being typed in, which is never taken from it: a form field, or text the nearest
 * contenteditable says is editable. In Live Preview the card is a widget CodeMirror marks not editable inside its
 * editable content, so a key in the card is the card's.
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

/** The sheet the details of one card are shown in, in view mode. */
export class DetailsSheet {
  private readonly el: HTMLElement;
  private readonly host: SheetHost;
  private toggle: HTMLButtonElement | null = null;
  private body: HTMLElement | null = null;
  private watcher: IntersectionObserver | null = null;
  /** Watches the card's size while the sheet is open, so the sheet is placed again when it changes. */
  private sizer: ResizeObserver | null = null;

  /** For the details element of a card, which sits in the card. */
  constructor(el: HTMLElement, host: SheetHost) {
    this.el = el;
    this.host = host;
    el.addEventListener('keydown', (e: KeyboardEvent) => this.key(e));
  }

  /** Whether the details are to be the sheet: as the host says, but never in a canvas card or a hover preview. */
  private wanted(): boolean {
    return this.host.on() && !this.el.closest(ELSEWHERE);
  }

  /** Puts the toggle in a new set of details' header, before its close button, when the details are the sheet. */
  head(head: HTMLElement): void {
    this.toggle = null;
    if (!this.wanted()) return;
    const t = head.createEl('button', { cls: ['clickable-icon', 'graph-note-sheet-toggle'], attr: { type: 'button' } });
    t.addEventListener('click', () => this.set(this.el.hasClass('is-minimised') ? 'restored' : 'minimised'));
    this.toggle = t;
  }

  /**
   * A new set of details is open, `body` below its header: as the sheet, pinned, sized and in the state last chosen; or,
   * where it cannot be pinned, in the card.
   */
  opened(body: HTMLElement): void {
    this.body = body;
    const on = this.wanted();
    this.el.toggleClass('graph-note-sheet', on);
    if (!on || !this.place()) return this.inCard();
    this.apply(remembered);
    this.watch();
  }

  /**
   * The window changed size (`resized`), or the note scrolled: the open sheet is placed again over its card, and, when its
   * size may have changed, the card keeps the chosen thing clear above it.
   */
  moved(resized: boolean): void {
    // away with its card, the sheet is not laid out at all (display: none): it is placed when the card comes back
    if (this.el.hidden || !this.el.hasClass('graph-note-sheet') || this.el.hasClass('is-away')) return;
    if (!this.place()) return this.inCard();
    if (resized) this.host.moved();
  }

  /** The details closed, or are no longer the sheet: nothing is pinned or watched. */
  closed(): void {
    this.watcher?.disconnect();
    this.watcher = null;
    this.sizer?.disconnect();
    this.sizer = null;
    this.el.removeClass('graph-note-sheet', 'is-minimised', 'is-away');
  }

  /** The details shown in the card, not as the sheet: no toggle, and the whole of them. */
  private inCard(): void {
    this.closed();
    this.toggle?.remove();
    this.toggle = null;
    if (this.body) this.body.hidden = false;
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
    t.setAttribute('aria-label', word(min ? 'details.restore' : 'details.minimise'));
    t.setAttribute('aria-expanded', String(!min));
  }

  /**
   * Pins the sheet over its card, as wide as it, at the foot of the part of the screen the note is seen in, or of the card
   * when the card ends above that, so the note below the card, and its caret, are never covered; and sizes it. Then checks
   * the browser laid it out there: inside a container that moves fixed things, as a transform does, it is not, and false
   * says so.
   */
  private place(): boolean {
    const card = (this.el.parentElement ?? this.el).getBoundingClientRect(),
      screen = screenOf(this.el),
      height = this.el.win.innerHeight,
      below = Math.max(screen.below, height - Math.min(card.bottom, screen.bottom));
    this.el.setCssProps({
      '--graph-note-sheet-left': `${card.left}px`,
      '--graph-note-sheet-width': `${card.width}px`,
      '--graph-note-sheet-bottom': `${below}px`,
      '--graph-note-sheet-max': `${sheetLimit(screen.bottom - screen.top)}px`,
    });
    const laid = this.el.getBoundingClientRect();
    return (
      Math.abs(laid.left - card.left) <= PLACED_WITHIN &&
      Math.abs(laid.width - card.width) <= PLACED_WITHIN &&
      Math.abs(laid.bottom - (height - below)) <= PLACED_WITHIN
    );
  }

  /**
   * Hides the sheet while its card is off the screen, and shows it again when the card comes back; and places it again,
   * keeping the chosen thing clear, when the card changes size.
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
    if (!this.el.hasClass('graph-note-sheet') || this.el.hidden) return;
    e.preventDefault();
    this.host.close();
  }
}
