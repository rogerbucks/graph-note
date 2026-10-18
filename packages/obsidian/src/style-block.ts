// A style block in a note (spec §2, style_block_in_note): never drawn as a graph, shown folded away until opened — a line
// saying whose style it is, what it holds and how many problems it has, and its text, coloured, inside.
import { readNote, readStyle } from '@thoughtknot/core';
import { renderCode } from '@thoughtknot/core/display/code';
import { readInHostDirection } from '@thoughtknot/core/display/host';
import { plural } from '@thoughtknot/core/display/graph-view/view-bar';

/** Shows the style block `source`, of graph `styled`, folded; `texts` are the note's gql blocks, with it among them. */
export function renderStyleBlock(el: HTMLElement, source: string, styled: string, texts: string[]): void {
  const { style, problems } = readStyle(texts, styled, readNote(texts));
  const own = problems.filter((p) => texts[p.block] === source && p.severity !== 'hint');
  // a Show switched off shows nothing, so it is not counted as a property shown
  const shownCount = style.shows.filter((s) => s.inline === 'on').length;
  const held = [
    style.nudges.length ? plural(style.nudges.length, 'nudge') : '',
    style.looks.length ? plural(style.looks.length, 'look') : '',
    shownCount ? `${shownCount} shown ${shownCount === 1 ? 'property' : 'properties'}` : '',
    style.views.size ? plural(style.views.size, 'view setting') : '',
    style.shown.size ? plural(style.shown.size, 'saved view') : '',
    style.arrows.length ? plural(style.arrows.length, 'arrowhead setting') : '',
    style.diagrams.length ? plural(style.diagrams.length, 'diagram type') : '',
  ].filter(Boolean);
  const fold = readInHostDirection(el.createEl('details', { cls: 'thoughtknot-style' }));
  fold.createEl('summary', {
    text: `Style of graph ${styled}: ${held.join(', ') || 'nothing yet'}${own.length ? ` — ⚠ ${plural(own.length, 'problem')}` : ''}`,
  });
  renderCode(fold, source);
}
