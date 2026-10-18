// A style block in a note (spec §2, style_block_in_note). It is never drawn as a graph. It is shown folded away until
// opened. A line says whose style it is, what it holds and how many problems it has. Its text, coloured, is inside.
import { readNote, readStyle, word } from '@thoughtknot/core';
import type { WordKey } from '@thoughtknot/core';
import { renderCode } from '@thoughtknot/core/display/code';
import { readInHostDirection } from '@thoughtknot/core/display/host';

/** Shows the style block `source`, of graph `styled`, folded; `texts` are the note's gql blocks, with it among them. */
export function renderStyleBlock(el: HTMLElement, source: string, styled: string, texts: string[]): void {
  const { style, problems } = readStyle(texts, styled, readNote(texts));
  const own = problems.filter((p) => texts[p.block] === source && p.severity !== 'hint');
  // a Show switched off shows nothing, so it is not counted as a property shown
  const shownCount = style.shows.filter((s) => s.inline === 'on').length;
  const counted: [WordKey, number][] = [
    ['style.nudges', style.nudges.length],
    ['style.looks', style.looks.length],
    ['style.shown', shownCount],
    ['style.view-settings', style.views.size],
    ['style.saved-views', style.shown.size],
    ['style.arrowheads', style.arrows.length],
    ['style.types', style.diagrams.length],
  ];
  const held = counted.filter(([, n]) => n).map(([key, count]) => word(key, { count }));
  const fold = readInHostDirection(el.createEl('details', { cls: 'thoughtknot-style' }));
  fold.createEl('summary', {
    text: word(own.length ? 'style.summary-problems' : 'style.summary', {
      graph: styled,
      held: held.join(', ') || word('style.nothing'),
      count: own.length,
    }),
  });
  renderCode(fold, source);
}
