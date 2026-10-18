// Where a drawing's data comes from (editor spec §7 view_of_another_note, §20 gql_file_source): a line above a card drawn
// from another note or a .gql file, naming it, and, for a note, a button that opens it, as a tap on a link would. What
// it says is read where it is written, so this is the way to change it.
import type { GraphSource } from '@thoughtknot/core';
import type ThoughtknotPlugin from '../main';

/** The source's name as the strip and its button say it: a note by its link, a file by its path. */
const shortName = (s: GraphSource) => s.target.replace(/\.md$/i, '');

/**
 * Puts the line saying where the data comes from at the top of `parent`: "Drawn from the note Trip" with Open Trip, or
 * "Drawn from the file Graphs/trip.gql". `from` is the path of the note the card is in, which a link is found from.
 */
export function sourceStrip(
  parent: HTMLElement,
  plugin: ThoughtknotPlugin,
  source: GraphSource,
  from: string,
): HTMLElement {
  const strip = parent.createDiv({ cls: 'thoughtknot-source' });
  strip.createSpan({
    text: `Drawn from the ${source.kind} ${shortName(source)}, read where it is written: change the graph there.`,
  });
  if (source.kind === 'note') {
    const name = shortName(source);
    const open = strip.createEl('button', {
      text: `Open ${name}`,
      attr: { 'aria-label': `Open ${name}`, type: 'button' },
    });
    open.addEventListener('click', () => void plugin.app.workspace.openLinkText(source.target, from));
  }
  return strip;
}

/** A sentence saying why nothing is drawn, read out as it appears. */
export function sourceAlert(parent: HTMLElement, text: string): HTMLElement {
  return parent.createDiv({ cls: 'thoughtknot-banner', attr: { role: 'alert' }, text });
}
