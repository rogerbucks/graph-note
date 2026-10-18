// Links on the drawing (editor spec §18). Each line of a box's or a link's words that holds a link is drawn as a link.
// It is drawn as broken where it names nothing in the vault (links_shown, broken_links_problems). A thing with
// attachments is given a paperclip with their count, said to screen readers too (attachments_at_a_glance). Marked on
// the SVG Graphviz drew, by class and one mark, so the layout source stays the Python library's.
import { attachmentsOf, linksIn } from '@thoughtknot/core';
import type { NoteReading } from '@thoughtknot/core';
import { cornerOf } from '../graph-view/parked';
import type { LinkHost } from './link-types';

const SVG = 'http://www.w3.org/2000/svg';

/** Marks the links and attachments of a drawing of graph `graph`, as the card's link host finds them in the vault. */
export function markLinks(svg: SVGSVGElement, reading: NoteReading, graph: string, host: LinkHost): void {
  for (const t of Array.from(svg.querySelectorAll('g.node text, g.edge text'))) {
    // a link that is never opened is never drawn as one (safe_to_click)
    const links = linksIn(t.textContent ?? '').filter((l) => l.kind !== 'refused');
    if (!links.length) continue;
    t.classList.add('thoughtknot-link');
    const broken = links.some((l) => (l.kind === 'note' || l.kind === 'file') && l.target && !host.found(l.target));
    t.classList.toggle('is-unresolved', broken);
  }
  for (const g of Array.from(svg.querySelectorAll('g.node'))) {
    const key = g.getAttribute('data-key');
    const n = key === null ? 0 : attachmentsOf(reading, graph, key).length;
    if (!n) continue;
    const said = `${n} attachment${n === 1 ? '' : 's'}`;
    g.setAttribute('aria-label', `${g.getAttribute('aria-label') ?? key}, ${said}`);
    const at = cornerOf(g);
    if (!at) continue;
    const mark = g.appendChild(activeDocument.createElementNS(SVG, 'text'));
    mark.setAttribute('class', 'thoughtknot-attachments');
    mark.setAttribute('x', String(at.left + 4));
    mark.setAttribute('y', String(at.top + 10));
    mark.textContent = `📎 ${n}`;
  }
}
