// Why a graph is shown as text instead of drawn (spec §9, layout_contained): a banner in plain words, saying which limit
// the graph is over and the numbers, or how long its layout was given, with an icon beside the words, never colour alone.
// The words are refusal-words.ts's.
import { setIcon } from 'obsidian';
import type { Refusal } from '@graph-note/core';
import { refusalWords } from './refusal-words';

/** Puts the banner saying why the graph is not drawn at the end of `parent`. */
export function refusalBanner(parent: HTMLElement, r: Refusal): HTMLElement {
  const banner = parent.createDiv({ cls: 'graph-note-banner graph-note-refusal', attr: { role: 'alert' } });
  setIcon(banner.createSpan({ cls: 'graph-note-refusal-icon' }), r.reason === 'too-large' ? 'alert-triangle' : 'clock');
  banner.createSpan({ text: refusalWords(r) });
  return banner;
}
