// How large a graph may be before it is shown as text instead of drawn (spec §9, layout_contained). Also how long its
// layout may take. The note's text is measured before it is read. The graph's things, links, longest word and drawing
// instructions are counted before any are written or laid out. The page's own thread has tighter limits. There a
// layout, once started, cannot be stopped.
import type { GraphDrawing } from './note-reading.ts';
import { directions } from './render.ts';
import type { Direction } from './render.ts';

/** How much of a note's graph blocks is read for drawing. */
export interface ReadLimits {
  /** The most bytes (UTF-8) of graph blocks read. */
  bytes: number;
  /** The most lines of graph blocks read. */
  lines: number;
}

/**
 * 512 kB and 10,000 lines. Take a graph at the drawing limits below: 2,000 things and 5,000 links, one to a line. At
 * about a hundred bytes each, it is about 7,000 lines and 400 kB. So these leave room for comments and blank lines. A
 * block pasted or generated past them would take seconds to read on a phone. It is shown as text unread.
 */
export const READ_LIMITS: ReadLimits = { bytes: 512_000, lines: 10_000 };

/** How much a graph may be before it is shown as text instead of drawn, and how long its layout may take. */
export interface LayoutLimits {
  things: number;
  links: number;
  /** The most bytes (UTF-8) of drawing instructions (the layout source) handed to Graphviz for one direction. */
  sourceBytes: number;
  /** The most characters in one word of a thing's text: wrapping a word takes time in the square of its length. */
  word: number;
  /** The most milliseconds a layout may take, from being handed to a ready worker, before the worker is stopped. */
  ms: number;
  /** The most milliseconds a worker may take to start its engine, before it is taken as failed. */
  startMs: number;
}

/**
 * The limits in a worker, until a setting changes them. A note's graphs are tens of things. 2,000 things or 5,000 links
 * is far past anything readable as a drawing. It is about the most that lays out in a few seconds on a phone. 1 MB of
 * drawing instructions is about 2,000 things written at 500 characters each. A word is held only by the source limit:
 * in a worker, the time limit stops a long one. Five seconds is ten times the half second a 50-thing graph may take
 * (spec §11). Thirty to start, as a phone compiling the engine on a cold start may take several.
 */
export const LAYOUT_LIMITS: LayoutLimits = {
  things: 2000,
  links: 5000,
  sourceBytes: 1_000_000,
  word: 1_000_000,
  ms: 5000,
  startMs: 30_000,
};

/**
 * The limits on the page's own thread, where no worker can run and nothing can stop a layout. They allow only what lays
 * out well within a second there. 300 things and 750 links lay out in under a second on a desktop. 100 kB of drawing
 * instructions is their size written at length. A word of 1,000 characters is wrapped in a moment. The 999,000 of a
 * hostile one would hold the page for minutes.
 */
export const PAGE_LIMITS: LayoutLimits = {
  ...LAYOUT_LIMITS,
  things: 300,
  links: 750,
  sourceBytes: 100_000,
  word: 1_000,
};

/**
 * Why a graph is shown as text instead of drawn. It gives which limit it is over and the numbers, or how long its
 * layout was given. Or it says layouts were stopped after too many in a row took too long or failed to start. A source
 * refused before it was written is counted from its texts alone (`atLeast`): the source would be longer still. `page`
 * says the page's tighter limits applied.
 */
export type Refusal =
  | {
      reason: 'too-large';
      limit: 'things' | 'links' | 'word' | 'source' | 'text-bytes' | 'text-lines';
      count: number;
      most: number;
      atLeast?: true;
      page?: true;
    }
  | { reason: 'timed-out'; ms: number }
  | { reason: 'stopped'; failures: number };

/** The UTF-8 length of a text, in bytes; with `inked`, only of its characters that are not spaces. */
export function bytesOf(text: string, inked = false): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inked && (c === 0x20 || (c >= 0x09 && c <= 0x0d))) continue;
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c < 0xdc00) {
      n += 4; // a pair of surrogates: one character, four bytes
      i++;
    } else n += 3;
  }
  return n;
}

/** Whether a note's graph blocks are too large to read, measured before any is read: bytes, then lines. */
export function textTooLarge(texts: string[], limits: ReadLimits = READ_LIMITS): Refusal | null {
  let bytes = 0,
    lines = 0;
  for (const t of texts) {
    bytes += bytesOf(t);
    lines += t.split('\n').length;
  }
  if (bytes > limits.bytes) return { reason: 'too-large', limit: 'text-bytes', count: bytes, most: limits.bytes };
  if (lines > limits.lines) return { reason: 'too-large', limit: 'text-lines', count: lines, most: limits.lines };
  return null;
}

/** The longest run of characters that are not spaces in a text. */
function longestWord(text: string): number {
  let most = 0,
    run = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    run = c === 0x20 || (c >= 0x09 && c <= 0x0d) ? 0 : run + 1;
    if (run > most) most = run;
  }
  return most;
}

/**
 * Over the things, links or word limit, or plainly over the source limit by the boxes' texts alone. All are cheap,
 * before any drawing instruction is written.
 */
export function counted(drawing: GraphDrawing, limits: LayoutLimits): Refusal | null {
  if (drawing.boxes.length > limits.things)
    return { reason: 'too-large', limit: 'things', count: drawing.boxes.length, most: limits.things };
  if (drawing.links.length > limits.links)
    return { reason: 'too-large', limit: 'links', count: drawing.links.length, most: limits.links };
  let word = 0,
    inked = 0;
  for (const b of drawing.boxes) {
    word = Math.max(word, longestWord(b.text));
    // every character of a box's text but its spaces is written into the source, escaped: the source is at least this
    inked += bytesOf(b.text, true);
  }
  if (word > limits.word) return { reason: 'too-large', limit: 'word', count: word, most: limits.word };
  return inked > limits.sourceBytes
    ? { reason: 'too-large', limit: 'source', count: inked, most: limits.sourceBytes, atLeast: true }
    : null;
}

/** Over the source limit, measured exactly on the drawing instructions written for each direction. */
export function measured(laid: Direction[], sourceBytes: number): Refusal | null {
  const count = Math.max(0, ...laid.map((d) => bytesOf(d.dot)));
  return count > sourceBytes ? { reason: 'too-large', limit: 'source', count, most: sourceBytes } : null;
}

/** Whether a drawing is over a size limit, and which: things, links, word, then drawing instructions, before any layout. */
export function tooLarge(drawing: GraphDrawing, limits: LayoutLimits): Refusal | null {
  return counted(drawing, limits) ?? measured(directions(drawing), limits.sourceBytes);
}
