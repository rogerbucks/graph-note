// Why a graph is shown as text instead of drawn (spec §9, layout_contained): a banner in plain words, saying which limit
// the graph is over and the numbers, or how long its layout was given, with an icon beside the words, never colour alone.
// The words are the core's (refusal-words.ts), shared with the browser editor's page.
import { setIcon } from 'obsidian';
import { refusalWords } from '@graph-note/core/hosts/refusal-words';
import type { Refusal } from '@graph-note/core';

/** Puts the banner saying why the graph is not drawn at the end of `parent`. */
export function refusalBanner(parent: HTMLElement, r: Refusal): HTMLElement {
  const banner = parent.createDiv({ cls: 'graph-note-banner graph-note-refusal', attr: { role: 'alert' } });
  setIcon(banner.createSpan({ cls: 'graph-note-refusal-icon' }), r.reason === 'too-large' ? 'alert-triangle' : 'clock');
  banner.createSpan({ text: refusalWords(r) });
  return banner;
}
