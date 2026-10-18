// Moving a box from the keyboard (spec §6, move_box_keyboard), for whoever does not drag: M on a box, or Move in its
// details, picks it up and says the first place it could go and the nudge that writes it; the arrow keys step through
// every place there is (box-drag.ts, placesFor), the box it would go by marked; Enter writes the nudge shown, through the
// card's host, and Escape puts the box down and writes nothing. Nothing moves while the card is only read.
import { landingSaid, placesFor, word } from '@graph-note/core';
import type { Landing } from '@graph-note/core';
import type { BoxMoving } from './box-drag-view';
import type { Taps } from './taps';

/** What moving a box from the keyboard reads of the card. */
export interface KeysHost {
  viewport: HTMLElement;
  taps: Taps;
  moving: BoxMoving;
  /** The text drawn on a thing's box, by its key. */
  textOf: (key: string) => string;
  /** Whether the card is only read here, where no box moves. */
  readOnly: () => boolean;
}

/** The line that says where a box being moved would go, made once for the viewport and shared with a drag. */
export function moveHint(viewport: HTMLElement): HTMLElement {
  return (
    viewport.querySelector<HTMLElement>('.graph-note-move-hint') ??
    viewport.createDiv({ cls: 'graph-note-move-hint', attr: { role: 'status' } })
  );
}

/** A box picked up from the keyboard: the places it could go, and the one shown now. */
interface Held {
  key: string;
  places: Landing[];
  at: number;
}

/** Moving a box with M, the arrow keys, Enter and Escape. */
export class BoxMoveKeys {
  private held: Held | null = null;
  private readonly host: KeysHost;

  constructor(host: KeysHost) {
    this.host = host;
  }

  /** Picks up the box of thing `key` and shows the first place it could go; false while the card is only read. */
  pick(key: string): boolean {
    this.cancel();
    if (this.host.readOnly()) return false;
    const keyOf = (id: string) => this.host.viewport.querySelector(`#${id}`)?.getAttribute('data-key') ?? null;
    const { written, centre } = this.host.moving;
    this.held = { key, places: placesFor(key, this.host.taps.boxes(keyOf), written, centre), at: 0 };
    this.boxOf(key)?.addClass('is-held');
    this.show();
    return true;
  }

  /** A key pressed while a box is picked up: true when it was the move's (an arrow, Enter or Escape). */
  key(e: KeyboardEvent): boolean {
    const held = this.held;
    if (!held || e.ctrlKey || e.metaKey || e.altKey) return false;
    const n = held.places.length;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') held.at = n ? (held.at + 1) % n : 0;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') held.at = n ? (held.at - 1 + n) % n : 0;
    else if (e.key === 'Enter') this.put();
    else if (e.key === 'Escape') this.cancel();
    else return false;
    if (this.held) this.show();
    return true;
  }

  /** Puts the box down where nothing is written. True when a box was picked up. */
  cancel(): boolean {
    const held = this.held;
    this.held = null;
    if (!held) return false;
    this.boxOf(held.key)?.removeClass('is-held');
    this.unmark();
    moveHint(this.host.viewport).hidden = true;
    return true;
  }

  /** Writes the nudge of the place shown, and says so once it is written. */
  private put(): void {
    const held = this.held,
      l = held?.places[held.at];
    this.cancel();
    if (held && l)
      this.host.moving.move(l.nudge, word('move.done', { said: landingSaid(l, held.key, this.host.textOf) }));
  }

  /** Marks the box the place shown is by, and says the place, which of how many, and the keys. */
  private show(): void {
    const held = this.held;
    if (!held) return;
    this.unmark();
    const l = held.places[held.at],
      hint = moveHint(this.host.viewport);
    if (l) this.boxOf(l.other)?.addClass('is-landing');
    hint.hidden = false;
    hint.textContent = l
      ? word('move.step', {
          said: landingSaid(l, held.key, this.host.textOf),
          at: held.at + 1,
          all: held.places.length,
        })
      : word('move.none', { thing: this.host.textOf(held.key) });
  }

  private unmark(): void {
    this.host.viewport.querySelectorAll('g.node.is-landing').forEach((g) => g.removeClass('is-landing'));
  }

  private boxOf(key: string): SVGElement | undefined {
    return Array.from(this.host.viewport.querySelectorAll<SVGElement>('g.node')).find(
      (g) => g.getAttribute('data-key') === key,
    );
  }
}
