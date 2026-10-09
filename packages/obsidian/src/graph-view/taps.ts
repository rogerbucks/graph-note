// Taps and keys in a drawing (spec §3, tap_cycles_near): what a tap or a key lands on — a box, a written link or an
// estimated one — and what is near enough to a tap to be what was meant: within a fingertip, the nearest first, and the
// next of them when the same place is tapped again.
import { TapCycle, hitAreas, nearby } from '@graph-note/core';
import type { HitAreas, View } from '@graph-note/core';

/** What a tap or a key can land on: a box, by its id, or an estimated link, by its place in the drawing's estimates. */
export type Target = { key: string } | { estimate: number } | { link: number };

/** How far from a box or a link, in screen pixels, a tap still reaches it: a fingertip's width (tap_cycles_near, §3). */
const REACH_PX = 22;
/** How close, in screen pixels, two taps must be to count as the same place, so the second takes the next thing near. */
const SAME_PLACE_PX = 12;

/** The box or link an element of the drawing belongs to, if any. */
export function targetAt(target: EventTarget | null): Target | null {
  const el = target as Element | null;
  const key = el?.closest?.('g.node')?.getAttribute('data-key');
  if (key) return { key };
  const edge = el?.closest?.('g.edge'),
    estimate = edge?.getAttribute('data-estimate'),
    link = edge?.getAttribute('data-link');
  if (estimate) return { estimate: Number(estimate) };
  return link ? { link: Number(link) } : null;
}

/** The box or link an id in the drawing names. */
export function targetOf(svg: SVGSVGElement, id: string): Target | null {
  return targetAt(svg.querySelector(`#${id}`) ?? null);
}

/** Where the things of one drawing are, for taps: what a tap reaches, and which of several a tap in the same place takes. */
export class Taps {
  private areas: HitAreas | null = null;
  private readonly cycle = new TapCycle(SAME_PLACE_PX);
  private readonly svgText: string;

  /** For the drawing whose SVG text this is. */
  constructor(svgText: string) {
    this.svgText = svgText;
  }

  /**
   * What a tap at a point in the viewport reaches, with the drawing shown at `v`, nearest first, by their ids in the
   * drawing: what it lands on, then what is within a fingertip of it (tap_cycles_near, §3).
   */
  near(p: { x: number; y: number }, v: View): string[] {
    this.areas ??= hitAreas(this.svgText);
    const vb = this.areas.viewBox;
    if (!v.width || !v.height || !vb.width || !vb.height) return [];
    const per = vb.width / v.width;
    return nearby(this.areas, vb.x + (p.x - v.x) * per, vb.y + ((p.y - v.y) * vb.height) / v.height, REACH_PX * per);
  }

  /** On or near several things, a tap in the same place again chooses the next of them (§3). */
  choose(p: { x: number; y: number }, ids: string[]): string | null {
    return ids.length ? this.cycle.tap(p.x, p.y, ids) : null;
  }
}
