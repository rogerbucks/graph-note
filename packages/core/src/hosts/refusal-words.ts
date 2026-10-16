// Why a graph is not laid out, in words (spec §9, layout_contained, and §16, failed_export): the limit it is over and the
// numbers, how long its layout was given, or that drawing is paused. One telling of each reason, in two voices: the banner
// over a graph shown as text instead, and the notice of an export that was stopped and wrote nothing.
import type { Refusal } from '../layout-limits.ts';

const count = (n: number) => n.toLocaleString('en-GB');

/** A size in bytes, as a person reads it: 100 bytes, 12.5 kB, 1.2 MB. */
function size(bytes: number): string {
  const one = (n: number) => String(Math.round(n * 10) / 10);
  if (bytes < 1000) return `${count(bytes)} bytes`;
  if (bytes < 1_000_000) return `${one(bytes / 1000)} kB`;
  return `${one(bytes / 1_000_000)} MB`;
}

type TooLarge = Extract<Refusal, { reason: 'too-large' }>;

/** Whether the limit is on the note's text, which is never read, rather than on the drawing. */
const ofText = (r: TooLarge) => r.limit === 'text-bytes' || r.limit === 'text-lines';

/** What is over the limit, and the limit, in words that follow a colon. */
function overWhat(r: TooLarge, counted: 'drawn' | 'laid out'): string {
  const least = r.atLeast ? 'at least ' : '';
  switch (r.limit) {
    case 'text-bytes':
      return `the graph blocks here hold ${size(r.count)} of text, and at most ${size(r.most)} is read`;
    case 'text-lines':
      return `the graph blocks here hold ${count(r.count)} lines, and at most ${count(r.most)} are read`;
    case 'source':
      return `this graph's drawing instructions are ${least}${size(r.count)}, and at most ${size(r.most)} are laid out`;
    case 'word':
      return `a word in this graph is ${count(r.count)} characters long, and at most ${count(r.most)} are ${counted}`;
    default:
      return `this graph has ${count(r.count)} ${r.limit}, and at most ${count(r.most)} are ${counted}`;
  }
}

const INSTEAD = 'It is shown as text instead.';

// on the page's own thread a layout cannot be stopped, so its limits are lower: say so, or the numbers puzzle
const PAGE = 'Graphs are laid out on the main thread here, so the limits are lower.';

/** The banner's words. */
export function refusalWords(r: Refusal): string {
  if (r.reason === 'timed-out') {
    const s = r.ms / 1000;
    return `Took too long to draw: laying this graph out took longer than ${s} second${s === 1 ? '' : 's'}, so it was stopped. ${INSTEAD}`;
  }
  if (r.reason === 'stopped')
    return `Drawing is paused: the last ${r.failures} layouts took too long or failed, so no more are started until the plugin is reloaded. ${INSTEAD}`;
  const head = ofText(r) ? 'Too large to read' : 'Too large to draw';
  return `${head}: ${overWhat(r, 'drawn')}.${r.page ? ` ${PAGE}` : ''} ${INSTEAD}`;
}

/**
 * The notice of an export that was stopped for a limit, in the words of every export that cannot be made: what happened,
 * why, that nothing was saved, and what to do.
 */
export function exportRefusalWords(r: Refusal): string {
  const made = 'The export could not be made:';
  if (r.reason === 'timed-out') {
    const s = r.ms / 1000;
    return `${made} laying the graph out took longer than ${s} second${s === 1 ? '' : 's'}, so it was stopped. Nothing was saved. Export a smaller view of the graph, or try again.`;
  }
  if (r.reason === 'stopped')
    return `${made} the last ${r.failures} layouts took too long or failed, so no more are started until the plugin is reloaded. Nothing was saved. Reload the plugin, then try again.`;
  const todo = ofText(r)
    ? 'Move some of the graphs to another note.'
    : r.limit === 'word'
      ? 'Shorten the long name or text.'
      : 'Export a smaller view of the graph, or split it into smaller graphs.';
  return `${made} ${overWhat(r, 'laid out')}.${r.page ? ` ${PAGE}` : ''} Nothing was saved. ${todo}`;
}

/**
 * The notice of an export whose layout failed: the layout worker or its engine raised `error`. Its reason is put in
 * brackets, as the runner words it ("the layout worker failed: boom" becomes "the layout worker failed (boom)"), then
 * that nothing was saved and what to do.
 */
export function exportFailureWords(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const told = /^(the layout (?:worker failed|engine could not start)): ([\s\S]*)$/.exec(message);
  const why = told ? `${told[1]} (${told[2]})` : `the layout worker failed (${message})`;
  return `The export could not be made: ${why}. Nothing was saved. Try again; if it keeps failing, reload the plugin.`;
}
