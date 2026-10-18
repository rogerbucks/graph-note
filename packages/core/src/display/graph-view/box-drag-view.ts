// Moving a box by dragging it (spec §6, nudge_preview, drag_moves_box, hold_to_drag_touch). A mouse or pen picks a box
// up as it is pressed. A finger picks it up only once held there for a moment (as a long press opens its tooltip, §24).
// So a swipe still scrolls or pans. Once the pointer has moved past a tap's slop the box follows it. The box it would
// land by is marked, and a line says the nudge it would write. Letting go writes that nudge to the style graph, through
// the card's host. Escape, or letting go where no place is shown, puts the box back and writes nothing. The core
// decides where it lands (box-drag.ts); this draws it.
import { landingFor, landingSaid, word } from '@thoughtknot/core';
import type { Landing, NudgeWrite, View, WrittenNudge } from '@thoughtknot/core';
import type { Taps } from './taps';

/** How far, in screen pixels, a press on a box moves before it is a drag rather than a tap. */
const SLOP_PX = 10;
/** How long, in milliseconds, a finger is held on a box to pick it up: the long press that opens its tooltip (§24). */
const HOLD_MS = 500;

/** What moving a box needs of its card: where the drawing is, and a way to write the nudge. */
export interface BoxMoving {
  /** The nudges already written for the graph, so a place already nudged is not offered again. */
  written: readonly WrittenNudge[];
  /** Writes the nudge into the style graph, and says `done` once it is written. */
  move: (nudge: NudgeWrite, done: string) => void;
}

/** What a drag reads of the card as it goes. */
export interface DragHost {
  viewport: HTMLElement;
  taps: Taps;
  view: () => View;
  /** The direction the drawing is laid out in now: LR or TB. */
  rankdir: () => string;
  /** The text drawn on a thing's box, by its key. */
  textOf: (key: string) => string;
  moving: BoxMoving;
  /** Whether the card is only read here, where no box moves. */
  readOnly: () => boolean;
}

interface Press {
  id: number;
  key: string;
  box: SVGElement;
  x: number;
  y: number;
  /** Whether the box is picked up: at once for a mouse or pen, after a moment held for a finger. */
  held: boolean;
  dragging: boolean;
  landing: Landing | null;
}

/** A box being moved by a mouse or pen: pressed, dragged past the slop, then let go or put back. */
export class BoxDrag {
  private press: Press | null = null;
  private hint: HTMLElement | null = null;
  private timer: number | null = null;
  private readonly host: DragHost;

  constructor(host: DragHost) {
    this.host = host;
  }

  /** Whether a box is picked up now, so the page under a finger dragging it must not scroll. */
  get holding(): boolean {
    return !!this.press?.held;
  }

  /** A pointer pressed on the box of thing `key`, at `p` in the viewport: a finger (`touch`) picks it up once held. */
  down(id: number, key: string, box: SVGElement, p: { x: number; y: number }, touch = false): void {
    this.cancel();
    if (this.host.readOnly()) return;
    const press: Press = { id, key, box, ...p, held: !touch, dragging: false, landing: null };
    this.press = press;
    if (touch)
      this.timer = window.setTimeout(() => {
        this.timer = null;
        if (this.press !== press) return;
        press.held = true;
        box.addClass('is-held');
      }, HOLD_MS);
  }

  /** The pointer moved to `p`: past the slop the box follows it and the place it would land is shown. True when dragging. */
  move(id: number, p: { x: number; y: number }): boolean {
    const press = this.press;
    if (!press || press.id !== id) return false;
    if (!press.dragging && Math.hypot(p.x - press.x, p.y - press.y) < SLOP_PX) return press.held;
    // a finger that moves off before it is held is swiping: the note scrolls or the drawing pans, and nothing moves
    if (!press.held) {
      this.cancel();
      return false;
    }
    if (!press.dragging) {
      press.dragging = true;
      press.box.addClass('is-dragged');
    }
    const v = this.host.view(),
      per = this.host.taps.toDrawing({ x: 1, y: 1 }, v),
      origin = this.host.taps.toDrawing({ x: 0, y: 0 }, v),
      at = this.host.taps.toDrawing(p, v);
    if (!per || !origin || !at) return true;
    const dx = (p.x - press.x) * (per.x - origin.x),
      dy = (p.y - press.y) * (per.y - origin.y);
    press.box.setAttribute('transform', `translate(${dx} ${dy})`);
    const keyOf = (id: string) => this.host.viewport.querySelector(`#${id}`)?.getAttribute('data-key') ?? null;
    press.landing = landingFor(
      press.key,
      at,
      this.host.taps.boxes(keyOf),
      this.host.rankdir(),
      this.host.moving.written,
    );
    this.mark(press);
    return true;
  }

  /** The pointer let go: a drag writes the nudge its place shows, if any. True when it was a drag, not a tap. */
  up(id: number): boolean {
    const press = this.press;
    if (!press || press.id !== id) return false;
    this.press = null;
    this.putBack(press);
    if (!press.dragging) return false;
    const l = press.landing;
    if (l) this.host.moving.move(l.nudge, word('move.done', { said: landingSaid(l, press.key, this.host.textOf) }));
    return true;
  }

  /** Escape, or the pointer lost: the box goes back where it was and nothing is written. True when a drag was put back. */
  cancel(): boolean {
    const press = this.press;
    this.press = null;
    if (press) this.putBack(press);
    return !!press?.dragging;
  }

  /** The card is gone: a finger's hold waited for is let go. */
  onunload(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  /** Marks the box it would land by and says where, or that letting go here places it nowhere. */
  private mark(press: Press): void {
    this.host.viewport.querySelectorAll('g.node.is-landing').forEach((g) => g.removeClass('is-landing'));
    const l = press.landing;
    if (l)
      Array.from(this.host.viewport.querySelectorAll<SVGElement>('g.node'))
        .find((g) => g.getAttribute('data-key') === l.other)
        ?.addClass('is-landing');
    this.hint ??= this.host.viewport.createDiv({ cls: 'thoughtknot-move-hint', attr: { role: 'status' } });
    this.hint.hidden = false;
    this.hint.textContent = l
      ? landingSaid(l, press.key, this.host.textOf)
      : word('move.nowhere', { thing: this.host.textOf(press.key) });
  }

  private putBack(press: Press): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    press.box.removeAttribute('transform');
    press.box.removeClass('is-dragged', 'is-held');
    this.host.viewport.querySelectorAll('g.node.is-landing').forEach((g) => g.removeClass('is-landing'));
    if (this.hint) this.hint.hidden = true;
  }
}
