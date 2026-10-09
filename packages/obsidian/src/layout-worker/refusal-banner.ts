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

/** The banner's words. */
export function refusalWords(r: Refusal): string {
  if (r.reason === 'timed-out') {
    const s = r.ms / 1000;
    return `Took too long to draw: laying this graph out took longer than ${s} second${s === 1 ? '' : 's'}, so it was stopped. It is shown as text instead.`;
  }
  if (r.limit === 'source')
    return `Too large to draw: this graph's layout source is ${r.atLeast ? 'at least ' : ''}${size(r.count)}, and at most ${size(r.most)} is laid out. It is shown as text instead.`;
  return `Too large to draw: this graph has ${count(r.count)} ${r.limit}, and at most ${count(r.most)} are drawn. It is shown as text instead.`;
}

/** Puts the banner saying why the graph is not drawn at the end of `parent`. */
export function refusalBanner(parent: HTMLElement, r: Refusal): HTMLElement {
  const banner = parent.createDiv({ cls: 'graph-note-banner graph-note-refusal', attr: { role: 'alert' } });
  setIcon(banner.createSpan({ cls: 'graph-note-refusal-icon' }), r.reason === 'timed-out' ? 'clock' : 'alert-triangle');
  banner.createSpan({ text: refusalWords(r) });
  return banner;
}
