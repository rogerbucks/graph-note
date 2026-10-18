// Why a graph is shown as text instead of drawn (spec §9, layout_contained): a banner in plain words, saying which limit
// the graph is over and the numbers, or how long its layout was given, with an icon beside the words, never colour alone.
// The words are the core's (refusal-words.ts), shared with the browser editor's page.
import { refusalWords } from '../hosts/refusal-words';
import type { Refusal } from '@thoughtknot/core';
import { setIcon } from './host';

/** Puts the banner saying why the graph is not drawn at the end of `parent`. */
export function refusalBanner(parent: HTMLElement, r: Refusal): HTMLElement {
  const banner = parent.createDiv({ cls: 'thoughtknot-banner thoughtknot-refusal', attr: { role: 'alert' } });
  const icon = banner.createSpan({ cls: 'thoughtknot-refusal-icon' });
  setIcon(icon, r.reason === 'too-large' ? 'alert-triangle' : 'clock');
  banner.createSpan({ text: refusalWords(r) });
  return banner;
}
