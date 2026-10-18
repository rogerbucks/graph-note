// Taps and keys in a drawing (spec §3, tap_cycles_near): what a tap or a key lands on — a box, a written link or an
// estimated one — and what is near enough to a tap to be what was meant: within a fingertip, the nearest first, and the
// next of them when the same place is tapped again.
import { TapCycle, boundsOf, centres, hitAreas, nearby } from '@graph-note/core';
import type { Bounds, HitAreas, PlacedBox, View } from '@graph-note/core';

/** What a tap or a key can land on: a box, by its id, or an estimated link, by its place in the drawing's estimates. */
export type Target = { key: string } | { estimate: number } | { link: number };

/** How far from a box or a link, in screen pixels, a tap still reaches it: a fingertip's width (tap_cycles_near, §3). */
const REACH_PX = 22;
/** How close, in screen pixels, two taps must be to count as the same place, so the second takes the next thing near. */
const SAME_PLACE_PX = 12;

/** The box or link an element of the drawing belongs to, if any: a table's row is its thing's or its link's (§15). */
export function targetAt(target: EventTarget | null): Target | null {
  const el = target as Element | null;
  const key = el?.closest?.('g.node, tr[data-key]')?.getAttribute('data-key');
  if (key) return { key };
  const edge = el?.closest?.('g.edge, tr[data-link]'),
    estimate = edge?.getAttribute('data-estimate'),
    link = edge?.getAttribute('data-link');
  if (estimate) return { estimate: Number(estimate) };
  return link ? { link: Number(link) } : null;
}

/** The fold an element of the drawing opens, if it is a busy hub's stub or a folded group's box (§25): `hub:` or `group:` and its name. */
export function foldAt(target: EventTarget | null): string | null {
  return (target as Element | null)?.closest?.('[data-fold]')?.getAttribute('data-fold') ?? null;
}

/** A thing's box in the drawing, by its key. */
export function boxIn(svg: Element | null, key: string): SVGElement | undefined {
  return Array.from(svg?.querySelectorAll<SVGElement>('g.node') ?? []).find((g) => g.getAttribute('data-key') === key);
}

/** The box or link an id in the drawing names. */
export function targetOf(svg: SVGSVGElement, id: string): Target | null {
  return targetAt(svg.querySelector(`#${id}`) ?? null);
}

/** Where the things of one drawing are, for taps: what a tap reaches, and which of several a tap in the same place takes. */
export class Taps {
  private areas: HitAreas | null = null;
  private readonly cycle = new TapCycle(SAME_PLACE_PX);
  private svgText: string;

  /** For the drawing whose SVG text this is. */
  constructor(svgText: string) {
    this.svgText = svgText;
  }

  /** The drawing was laid out again (§25): its areas are found afresh, from its new SVG text. */
  reset(svgText: string): void {
    this.svgText = svgText;
    this.areas = null;
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

  /** Where the box or link with this id in the drawing is, as fractions of the drawing, to bring it into view (§25). */
  bounds(id: string): Bounds | null {
    this.areas ??= hitAreas(this.svgText);
    return boundsOf(this.areas, id);
  }

  /** The middle of each box, by the key `keyOf` gives its id in the drawing: where the arrow keys walk between (§25). */
  places(keyOf: (id: string) => string | null): Map<string, { x: number; y: number }> {
    this.areas ??= hitAreas(this.svgText);
    const out = new Map<string, { x: number; y: number }>();
    for (const [id, at] of centres(this.areas)) {
      const key = keyOf(id);
      if (key !== null) out.set(key, at);
    }
    return out;
  }

  /** A point in the viewport, with the drawing shown at `v`, in the drawing's own units; null before it has a size. */
  toDrawing(p: { x: number; y: number }, v: View): { x: number; y: number } | null {
    this.areas ??= hitAreas(this.svgText);
    const vb = this.areas.viewBox;
    if (!v.width || !v.height || !vb.width || !vb.height) return null;
    return { x: vb.x + ((p.x - v.x) * vb.width) / v.width, y: vb.y + ((p.y - v.y) * vb.height) / v.height };
  }

  /** Each box, by the key `keyOf` gives its id in the drawing, with its edges in the drawing's own units: where a dragged box can land (§6). */
  boxes(keyOf: (id: string) => string | null): PlacedBox[] {
    this.areas ??= hitAreas(this.svgText);
    const vb = this.areas.viewBox,
      out: PlacedBox[] = [];
    for (const s of this.areas.shapes) {
      const key = s.kind === 'node' ? keyOf(s.id) : null,
        b = key === null ? null : boundsOf(this.areas, s.id);
      if (key !== null && b) {
        const left = vb.x + b.x * vb.width,
          top = vb.y + b.y * vb.height;
        out.push({ key, left, top, right: left + b.width * vb.width, bottom: top + b.height * vb.height });
      }
    }
    return out;
  }

  /** On or near several things, a tap in the same place again chooses the next of them (§3). */
  choose(p: { x: number; y: number }, ids: string[]): string | null {
    return ids.length ? this.cycle.tap(p.x, p.y, ids) : null;
  }
}
