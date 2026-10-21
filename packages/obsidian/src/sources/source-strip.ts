// Where a drawing's data comes from (editor spec §7 view_of_another_note, §20 gql_file_source).
// A line above a card drawn from another note or a .gql file names it. For a note it has a button that opens it,
// as a tap on a link would. What it says is read where it is written, so this is the way to change it.
import { word } from '@thoughtknot/core';
import type { GraphSource } from '@thoughtknot/core';
import type ThoughtKnotPlugin from '../main';

/** The source's name as the strip and its button say it: a note by its link, a file by its path. */
const shortName = (s: GraphSource) => s.target.replace(/\.md$/i, '');

/**
 * Puts the line saying where the data comes from at the top of `parent`: "Drawn from the note Trip" with Open Trip, or
 * "Drawn from the file Graphs/trip.gql". `from` is the path of the note the card is in, which a link is found from.
 */
export function sourceStrip(
  parent: HTMLElement,
  plugin: ThoughtKnotPlugin,
  source: GraphSource,
  from: string,
): HTMLElement {
  const strip = parent.createDiv({ cls: 'thoughtknot-source' });
  strip.createSpan({
    text: word('blocks.source-strip', { kind: source.kind, name: shortName(source) }),
  });
  if (source.kind === 'note') {
    const name = shortName(source);
    const open = strip.createEl('button', {
      text: word('blocks.source-open', { name }),
      attr: { 'aria-label': word('blocks.source-open', { name }), type: 'button' },
    });
    open.addEventListener('click', () => void plugin.app.workspace.openLinkText(source.target, from));
  }
  return strip;
}

/** A sentence saying why nothing is drawn, read out as it appears. */
export function sourceAlert(parent: HTMLElement, text: string): HTMLElement {
  return parent.createDiv({ cls: 'thoughtknot-banner', attr: { role: 'alert' }, text });
}
