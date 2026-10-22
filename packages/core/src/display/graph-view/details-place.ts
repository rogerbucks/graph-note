// Where a card's details go (editor spec §25, sheet_docked and details_in_host_pane). This holds the place button in
// their header, its menu, and what was last chosen. The places are the bottom, the top or either side of the note's visible
// part, and the host's own side pane where it has one. What was chosen holds for the rest of the session. Where the
// host keeps data of its own, it is kept there too, so the details open as they were left after a restart.
import { displayHost, keptLayout, setIcon, sidePane } from '../host';
import { SHEET_DOCKS, currentDirection, sideways, word } from '@thoughtknot/core';
import type { SheetDock } from '@thoughtknot/core';

/** Minimised to a bar, or restored to the full details. */
export type SheetState = 'restored' | 'minimised';

/** Where the details go: a place over the card, or the host's own side pane. */
export type DetailsPlace = SheetDock | 'pane';

/**
 * What was last chosen, which every sheet opens with for the rest of the session: the plugin's, until it is reloaded.
 * The size is a share of the screen across it, one for the top and bottom and one for the sides; null until resized.
 */
export const remembered: { state: SheetState; place: DetailsPlace; up: number | null; across: number | null } = {
  state: 'restored',
  place: 'bottom',
  up: null,
  across: null,
};

/** Whether what the host kept has been read yet: once, before the first details open. */
let read = false;

/** What the host kept of the last place, size and state, read into `remembered` once; anything not valid is left out. */
export function readKept(): void {
  if (read) return;
  read = true;
  const k = keptLayout()?.saved() as Partial<Record<keyof typeof remembered, unknown>> | null | undefined;
  if (!k || typeof k !== 'object') return;
  if (k.state === 'restored' || k.state === 'minimised') remembered.state = k.state;
  if (k.place === 'pane' || SHEET_DOCKS.includes(k.place as SheetDock)) remembered.place = k.place as DetailsPlace;
  const share = (v: unknown) => (typeof v === 'number' && v > 0 && v < 1 ? v : null);
  remembered.up = share(k.up);
  remembered.across = share(k.across);
}

/** Keeps what was last chosen where the host keeps its data, when it does. */
export function keepChosen(): void {
  keptLayout()?.save({ ...remembered });
}

/** Chooses a new place or state for every set of details opened after, and keeps it. */
export function choose(chosen: Partial<typeof remembered>): void {
  Object.assign(remembered, chosen);
  keepChosen();
}

/** The menu's word and icon for each place. A side is named as it is seen, left or right, whichever way the host reads. */
const PLACES = {
  bottom: ['details.dock-bottom', 'panel-bottom'],
  top: ['details.dock-top', 'panel-top'],
  left: ['details.dock-left', 'panel-left'],
  right: ['details.dock-right', 'panel-right'],
  pane: ['details.dock-pane', 'panel-right-open'],
} as const;

/** The side a sheet at `start` or `end` is seen on, as the host reads; null for the bottom or top. */
export function sideOf(dock: SheetDock): 'left' | 'right' | null {
  if (!sideways(dock)) return null;
  const rtl = currentDirection() === 'rtl';
  return (dock === 'start') !== rtl ? 'left' : 'right';
}

/** The place button, put in a set of details' header: named, and saying it opens a menu. */
export function placeButton(head: HTMLElement): HTMLButtonElement {
  const p = head.createEl('button', {
    cls: ['clickable-icon', 'thoughtknot-sheet-place'],
    attr: { type: 'button', 'aria-label': word('details.place'), 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
  });
  setIcon(p, 'layout-panel-left');
  return p;
}

/** What the place menu offers: where the details are `now`, whether places over the card and the side pane are offered. */
export interface PlaceChoice {
  now: DetailsPlace;
  docks: boolean;
  pane: boolean;
  go: (place: DetailsPlace) => void;
}

/** The place button's menu, shown below `from`: each place over the card, then the host's side pane, `now`'s ticked. */
export function placeMenu(from: HTMLElement, c: PlaceChoice): void {
  const r = from.getBoundingClientRect(),
    rows: { title: string; icon: string; checked: boolean; onClick: () => void }[] = [];
  const row = (place: DetailsPlace, key: keyof typeof PLACES) => {
    const [title, icon] = PLACES[key];
    rows.push({ title: word(title), icon, checked: c.now === place, onClick: () => c.go(place) });
  };
  if (c.docks) for (const dock of SHEET_DOCKS) row(dock, sideOf(dock) ?? (dock === 'top' ? 'top' : 'bottom'));
  if (c.pane) row('pane', 'pane');
  displayHost().menu(rows, { x: r.left, y: r.bottom }, from.doc);
}

/** A card's details in the host's side pane: moved there, and back to where they sat in their card. */
export class InPane {
  /** Where the details sat in the card before they went into the pane; null while they are in the card. */
  private home: { parent: HTMLElement; next: Node | null } | null = null;

  constructor(private readonly el: HTMLElement) {}

  /** Whether the details are in the pane now. */
  on(): boolean {
    return this.home !== null;
  }

  /** The card the details came from, while they are in the pane. */
  card(): HTMLElement | null {
    return this.home?.parent ?? null;
  }

  /**
   * Shows the details in the pane, under the name in their header, or again when they are there. `left` is told when
   * they leave it without being asked, once they are back in their card.
   */
  show(left: (why: 'closed' | 'taken') => void): void {
    const pane = sidePane();
    if (!pane) return;
    if (!this.home && this.el.parentElement) this.home = { parent: this.el.parentElement, next: this.el.nextSibling };
    const title = this.el.querySelector('.thoughtknot-details-head strong')?.textContent ?? '';
    pane.show(this.el, title, (why) => {
      if (!this.on()) return;
      this.back(false);
      left(why);
    });
  }

  /** The details come back to where they sat in their card; `release` lets the pane go too. */
  back(release = true): void {
    const home = this.home;
    if (!home) return;
    this.home = null;
    if (release) sidePane()?.release(this.el);
    home.parent.insertBefore(this.el, home.next?.parentNode === home.parent ? home.next : null);
  }
}
