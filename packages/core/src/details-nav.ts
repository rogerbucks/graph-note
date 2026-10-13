// Finding your way from a thing's details (editor spec §25, slice 3): its links grouped by relationship type and
// direction and read in words with a count (details_links_listed); the trail of things chosen from them, with back and
// forward steps (details_trail); the eased move to a chosen thing and the scale below which a thing is too small to read
// (details_choose_moves, details_move_motion); the arrow at the edge of the view pointing to a selection out of sight
// (selection_pointer); and how much of the screen the details sheet may take (sheet_min_max). Pure: the host draws it.
import gs from '@graph-note/graph-spec';
import type { Bounds } from './hits.ts';
import { STYLE } from './layout.ts';
import type { NoteReading } from './note-reading.ts';
import type { Place, Size, View } from './zoom.ts';

/** One group of a thing's links: one relationship type, one way, with the things at their other ends. */
export interface LinkGroup {
  type: string;
  direction: 'out' | 'in';
  /** The reading this way: "reports to" out, "is reported to by" in. */
  reading: string;
  /** The things at the other ends, in the order the links are written, each with its link's index in the drawing. */
  things: { key: string; text: string; link: number }[];
  count: number;
  /** The group in words: "reports to Ann", "is reported to by Bob and Cy (2)". */
  words: string;
  /** The words before and after the things' names, listed as `listed` lists them, so a host can make each name a control. */
  before: string;
  after: string;
}

/** Names listed as a sentence lists them: "Ann", "Bob and Cy", "Bob, Cy and Dee". */
export function listed(names: string[]): string {
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The readings back declared by the graph's schema, or the shared schema it names, by relationship type. */
function reverses(reading: NoteReading, graph: string): Map<string, string | undefined> {
  const g = reading.whole[graph] ?? reading.world[graph];
  if (!g) return new Map();
  const shared = gs.schemaFor(reading.whole, graph)[1];
  return new Map([...gs.readings(g, shared)].map(([type, [, back]]) => [type, back]));
}

/**
 * A thing's links grouped by relationship type and direction (details_links_listed): the groups of links out first, then
 * those in, each in the order its first link is written. A group reads as a sentence, with the count in brackets when it
 * holds more than one link. A link in reads by the schema's reverse reading, or the one the graph library guesses; where
 * it can guess none, as the link reads forward, ending "this": "Bob and Cy part of plan this".
 */
export function linkGroups(reading: NoteReading, graph: string, key: string): LinkGroup[] {
  const d = reading.graphs.get(graph);
  if (!d?.boxes.some((b) => b.key === key)) return [];
  const textOf = (k: string) => d.boxes.find((b) => b.key === k)?.text ?? k;
  const back = reverses(reading, graph);
  const groups = new Map<string, LinkGroup>();
  for (const direction of ['out', 'in'] as const)
    d.links.forEach((l, link) => {
      if ((direction === 'out' ? l.from : l.to) !== key) return;
      const other = direction === 'out' ? l.to : l.from;
      const id = `${direction} ${l.type}`;
      const group = groups.get(id) ?? {
        type: l.type,
        direction,
        reading: direction === 'out' ? l.reading : (back.get(l.type) ?? gs.reverseReading(l.reading)),
        things: [],
        count: 0,
        words: '',
        before: '',
        after: '',
      };
      group.things.push({ key: other, text: textOf(other), link });
      group.count = group.things.length;
      groups.set(id, group);
    });
  for (const g of groups.values()) {
    const count = g.count > 1 ? ` (${g.count})` : '',
      forward = d.links[g.things[0]?.link ?? 0]?.reading ?? g.type,
      guessed = g.reading.startsWith('inverse of ');
    g.before = guessed ? '' : `${g.reading} `;
    g.after = guessed ? ` ${forward} this${count}` : count;
    g.words = `${g.before}${listed(g.things.map((t) => t.text))}${g.after}`;
  }
  return [...groups.values()];
}

/** One step of a walk through the graph from its details: a thing, or a link by its index in the drawing. */
export type TrailStep = { key: string } | { link: number };

const same = (a: TrailStep, b: TrailStep) =>
  'key' in a ? 'key' in b && a.key === b.key : 'link' in b && a.link === b.link;

/**
 * The trail of things chosen from the details (details_trail): started again by a thing chosen in the drawing, added to
 * by each choice from its links, and walked with back and forward. A choice made after going back drops what was ahead,
 * as a browser's history does.
 */
export class Trail {
  private steps: TrailStep[] = [];
  private at = -1;

  /** Starts a new walk at a thing or link chosen in the drawing. */
  start(step: TrailStep): void {
    this.steps = [step];
    this.at = 0;
  }

  /** A choice from the details: the next step, unless it is where the walk already is. Null when no walk is under way. */
  go(step: TrailStep): TrailStep | null {
    const now = this.current();
    if (!now) return null;
    if (!same(now, step)) {
      this.steps = [...this.steps.slice(0, this.at + 1), step];
      this.at++;
    }
    return step;
  }

  /** One step back, or null at the start. */
  back(): TrailStep | null {
    if (!this.canBack()) return null;
    return this.steps[--this.at] ?? null;
  }

  /** One step forward again, or null at the end. */
  forward(): TrailStep | null {
    if (!this.canForward()) return null;
    return this.steps[++this.at] ?? null;
  }

  /** Where the walk is, or null when there is none. */
  current(): TrailStep | null {
    return this.steps[this.at] ?? null;
  }

  /** The step back would go to, or null. */
  previous(): TrailStep | null {
    return this.at > 0 ? (this.steps[this.at - 1] ?? null) : null;
  }

  /** The step forward would go to, or null. */
  next(): TrailStep | null {
    return this.steps[this.at + 1] ?? null;
  }

  /** Whether there is a step back. */
  canBack(): boolean {
    return this.at > 0;
  }

  /** Whether there is a step forward. */
  canForward(): boolean {
    return this.at >= 0 && this.at < this.steps.length - 1;
  }

  /** Forgets the walk, as closing the details does. */
  clear(): void {
    this.steps = [];
    this.at = -1;
  }
}

/** How long the move to a chosen thing takes, in milliseconds: brief, so it shows where the view went and never waits. */
export const MOVE_MS = 240;

/** The smallest a drawing's words may be on the screen, in pixels, before a thing is too small to read. */
const READABLE_PX = 11;

/** The scale below which a thing's words are too small to read (details_choose_moves): its words under 11 pixels. */
export const READABLE_SCALE = READABLE_PX / ((STYLE.font_size * 4) / 3);

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Where the view is a fraction `t` of the way through the move, eased in and out: `from` at 0, exactly `to` from 1. */
export function glideAt(from: Place, to: Place, t: number): Place {
  if (t >= 1) return { ...to };
  if (t <= 0) return { ...from };
  const e = ease(t),
    mix = (a: number, b: number) => a + (b - a) * e;
  return { scale: mix(from.scale, to.scale), x: mix(from.x, to.x), y: mix(from.y, to.y) };
}

/** Where the arrow pointing to a selection out of sight sits in the viewport, and its angle in degrees (0 is right, 90 down). */
export interface Pointing {
  x: number;
  y: number;
  angle: number;
}

/** How far in from the viewport's edge the arrow's middle sits: half the 44 points of a touch target. */
const EDGE = 22;

/**
 * The arrow at the edge of the view pointing to a selection out of sight (selection_pointer): none while any of it shows
 * in the part of the viewport not covered by the sheet (`clear` pixels at its foot); otherwise at the edge of that part,
 * on the line from its middle towards the selection, pointing along it.
 */
export function pointerTo(box: Bounds, view: View, viewport: Size, clear = 0): Pointing | null {
  const room = Math.max(0, viewport.height - clear);
  const left = view.x + box.x * view.width,
    top = view.y + box.y * view.height,
    right = left + box.width * view.width,
    bottom = top + box.height * view.height;
  if (right > 0 && left < viewport.width && bottom > 0 && top < room) return null;
  const mx = viewport.width / 2,
    my = room / 2,
    dx = (left + right) / 2 - mx,
    dy = (top + bottom) / 2 - my;
  const halfW = Math.max(0, mx - EDGE),
    halfH = Math.max(0, my - EDGE);
  const reach = Math.min(dx ? halfW / Math.abs(dx) : Infinity, dy ? halfH / Math.abs(dy) : Infinity);
  return { x: mx + dx * reach, y: my + dy * reach, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
}

/** The most of the visible screen's height the sheet takes when restored: a share, so it never fills the screen. */
export const SHEET_SHARE = 0.45;

/** The height kept above the sheet for the chosen thing and some of the drawing round it, in pixels. */
export const ABOVE_SHEET = 160;

/** The least the sheet is allowed, in pixels: its bar, with the thing's name and kind and its two buttons. */
const BAR_PX = 52;

/**
 * The tallest the restored sheet may be on a visible screen `screen` pixels high (sheet_min_max): its share of the screen,
 * less where that would leave too little above it for the chosen thing and some of the drawing; never less than its bar.
 */
export function sheetLimit(screen: number): number {
  return Math.max(BAR_PX, Math.min(screen * SHEET_SHARE, screen - ABOVE_SHEET));
}

/** How many pixels of a viewport, given by its top and bottom on the screen, a sheet whose top is at `sheetTop` covers. */
export function coverOf(viewport: { top: number; bottom: number }, sheetTop: number): number {
  return Math.min(viewport.bottom - viewport.top, Math.max(0, viewport.bottom - sheetTop));
}
