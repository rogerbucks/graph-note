// Why a graph is shown as text instead of drawn (spec §9, layout_contained): a banner in plain words, saying which limit
// the graph is over and the numbers, or how long its layout was given, with an icon beside the words, never colour alone.
import { setIcon } from 'obsidian';
import type { Refusal } from '@graph-note/core';

const count = (n: number) => n.toLocaleString('en-GB');

/** A size in bytes, as a person reads it: 100 bytes, 12.5 kB, 1.2 MB. */
function size(bytes: number): string {
  const one = (n: number) => String(Math.round(n * 10) / 10);
  if (bytes < 1000) return `${count(bytes)} bytes`;
  if (bytes < 1_000_000) return `${one(bytes / 1000)} kB`;
  return `${one(bytes / 1_000_000)} MB`;
}

const INSTEAD = 'It is shown as text instead.';

/** What is over the limit, and the limit, in words. */
function overWhat(r: Extract<Refusal, { reason: 'too-large' }>): string {
  const least = r.atLeast ? 'at least ' : '';
  switch (r.limit) {
    case 'text-bytes':
      return `Too large to read: the graph blocks here hold ${size(r.count)} of text, and at most ${size(r.most)} is read.`;
    case 'text-lines':
      return `Too large to read: the graph blocks here hold ${count(r.count)} lines, and at most ${count(r.most)} are read.`;
    case 'source':
      return `Too large to draw: this graph's drawing instructions are ${least}${size(r.count)}, and at most ${size(r.most)} are laid out.`;
    case 'word':
      return `Too large to draw: a word in this graph is ${count(r.count)} characters long, and at most ${count(r.most)} are drawn.`;
    default:
      return `Too large to draw: this graph has ${count(r.count)} ${r.limit}, and at most ${count(r.most)} are drawn.`;
  }
}

/** The banner's words. */
export function refusalWords(r: Refusal): string {
  if (r.reason === 'timed-out') {
    const s = r.ms / 1000;
    return `Took too long to draw: laying this graph out took longer than ${s} second${s === 1 ? '' : 's'}, so it was stopped. ${INSTEAD}`;
  }
  if (r.reason === 'stopped')
    return `Drawing is paused: the last ${r.failures} layouts took too long or failed, so no more are started until the plugin is reloaded. ${INSTEAD}`;
  // on the page's own thread a layout cannot be stopped, so its limits are lower: say so, or the numbers puzzle
  const page = r.page ? ' Graphs are laid out on the main thread here, so the limits are lower.' : '';
  return `${overWhat(r)}${page} ${INSTEAD}`;
}

/** Puts the banner saying why the graph is not drawn at the end of `parent`. */
export function refusalBanner(parent: HTMLElement, r: Refusal): HTMLElement {
  const banner = parent.createDiv({ cls: 'graph-note-banner graph-note-refusal', attr: { role: 'alert' } });
  setIcon(banner.createSpan({ cls: 'graph-note-refusal-icon' }), r.reason === 'too-large' ? 'alert-triangle' : 'clock');
  banner.createSpan({ text: refusalWords(r) });
  return banner;
}
