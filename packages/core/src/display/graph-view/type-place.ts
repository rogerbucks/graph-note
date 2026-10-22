// Where a card was when its diagram type changed (spec §15, type_keeps_place). Changing the type draws a new card, saved
// or only looked at. That card takes up where the last was left: its zoom, the thing selected with its details, and
// full screen, if it was open. The selected thing is brought into view where the new layout put it.
import type { View, Zoom } from '@thoughtknot/core';
import { glideBoxes } from './regroup';
import { boxIn } from './taps';
import type { Taps } from './taps';
import type { DiagramShown, TypeLeftAt } from './type-strip';
import type { ViewOptions } from './view-options';

/** Where a card is now, given its view, the thing selected, and whether it is the full-screen card. */
export const typeLeftAt = (v: View, selected: string | null, full: boolean): TypeLeftAt => ({
  zoom: v.scale,
  x: v.x,
  y: v.y,
  ...(selected ? { selected } : {}),
  ...(full ? { full: true } : {}),
});

/** What one card takes up of where the last card was left as its type changed. */
export class TypePlace {
  private kept: TypeLeftAt | undefined;
  /** Where its full-screen card was, for the full-screen card drawn again from this one. */
  private handOn: TypeLeftAt | undefined;

  /** Takes up where the last card was left, once, for the card in `mode`; gives it, for the zoom and selection. */
  take(diagram: DiagramShown | undefined, mode: string): TypeLeftAt | undefined {
    this.kept = diagram?.kept?.();
    if (this.kept?.full && mode === 'note') this.handOn = this.kept;
    return this.kept;
  }

  /** The card's options `o`, for its full-screen card, which takes up where the last full-screen card was. */
  forFull(o: ViewOptions): ViewOptions {
    const { diagram } = o;
    if (!diagram) return o;
    return {
      ...o,
      diagram: {
        ...diagram,
        kept: () => {
          const at = this.handOn;
          this.handOn = undefined;
          return at;
        },
      },
    };
  }

  /** Once the card is placed: the thing selected brought into view, and full screen opened again when it was open. */
  takeUp(svg: SVGSVGElement | null, taps: Taps, zoom: Zoom, full: () => void): void {
    const key = this.kept?.selected,
      g = key && svg ? boxIn(svg, key) : null,
      box = g ? taps.bounds(g.getAttribute('id') ?? '') : null;
    if (box) zoom.reveal(box);
    // a radial drawing laid out around a new centre: each box glides from where it was (radial_centre_pick)
    if (this.kept?.places) glideBoxes(svg, this.kept.places);
    if (this.handOn) full();
  }
}
