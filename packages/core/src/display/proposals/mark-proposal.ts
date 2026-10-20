// A proposal laid over the drawing (spec §17, proposal_shown_not_applied). Each box and link the proposal adds, changes
// or removes is marked on the SVG Graphviz drew, so the layout stays the Python library's. It is marked by a line style
// and a word, and said so to screen readers, never by colour alone.
import { MARK_WORDS, word } from '@thoughtknot/core';
import type { MarkKind, Marks } from '@thoughtknot/core';
import { cornerOf } from '../graph-view/parked';

const SVG = 'http://www.w3.org/2000/svg';
/** The sign beside each mark's word on a box. */
const SIGNS: Record<MarkKind, string> = { add: '+', change: '~', remove: '−' };

/** Adds to what a screen reader hears of a box or link. */
const say = (g: Element, words: string) => {
  const label = g.getAttribute('aria-label');
  g.setAttribute('aria-label', label ? `${label}, ${words}` : words);
};

/** Marks the drawing's boxes and links as the proposal says: a class for the line, a word and a sign, and the name said so. */
export function markProposal(svg: SVGSVGElement, marks: Marks): void {
  for (const g of Array.from(svg.querySelectorAll('g.node'))) {
    const mark = marks.boxes.get(g.getAttribute('data-key') ?? '');
    if (!mark) continue;
    g.classList.add('thoughtknot-proposed', `is-${mark.kind}`);
    say(g, word('proposal.marked', { mark: MARK_WORDS[mark.kind].toLowerCase() }));
    const at = cornerOf(g);
    if (!at) continue;
    const text = g.appendChild(activeDocument.createElementNS(SVG, 'text'));
    text.setAttribute('class', 'thoughtknot-proposal-mark');
    text.setAttribute('x', String(at.right - 4));
    text.setAttribute('y', String(at.top + 10));
    text.setAttribute('text-anchor', 'end');
    text.textContent = `${SIGNS[mark.kind]} ${MARK_WORDS[mark.kind].toLowerCase()}`;
  }
  for (const g of Array.from(svg.querySelectorAll('g.edge[data-link]'))) {
    const mark = marks.links.get(Number(g.getAttribute('data-link')));
    if (!mark) continue;
    g.classList.add('thoughtknot-proposed', `is-${mark.kind}`);
    say(g, word('proposal.marked', { mark: MARK_WORDS[mark.kind].toLowerCase() }));
  }
}
