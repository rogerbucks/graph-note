// Certainty on a drawing (editor spec §36, certainty_drawn). A thing whose certainty is written gets its level's line
// weight and dash. It gets a mark in words at its top right, and its level is said to screen readers. That is on the drawing
// Graphviz drew, as for a parked thing, so its layout stays the Python library's. Never by colour alone.
import { CERTAINTY_LOOKS, word } from '@thoughtknot/core';
import type { Box } from '@thoughtknot/core';
import { cornerOf } from './parked';

const SVG = 'http://www.w3.org/2000/svg';

/** Marks each box of a drawing whose certainty is written: line weight, dash, a mark in words, and its name said so. */
export function markCertainty(svg: SVGSVGElement, boxes: Box[]): void {
  for (const g of Array.from(svg.querySelectorAll('g.node'))) {
    const box = boxes.find((b) => b.key === g.getAttribute('data-key'));
    if (!box?.certainty) continue;
    const look = CERTAINTY_LOOKS[box.certainty];
    g.classList.add('thoughtknot-certainty', `is-${box.certainty}`);
    g.setAttribute('data-style', look.style);
    for (const shape of Array.from(g.querySelectorAll('path, polygon, ellipse'))) {
      shape.setAttribute('stroke-width', String(look.lineWidth));
      if (look.dash) shape.setAttribute('stroke-dasharray', look.dash.join(' '));
    }
    const said = word(`certainty.said.${box.certainty}`);
    g.setAttribute('aria-label', `${g.getAttribute('aria-label') ?? box.text}, ${said}`);
    const at = cornerOf(g);
    if (!look.mark || !at) continue;
    const mark = g.appendChild(activeDocument.createElementNS(SVG, 'text'));
    mark.setAttribute('class', 'thoughtknot-certainty-mark');
    mark.setAttribute('x', String(at.right - 4));
    mark.setAttribute('y', String(at.top + 10));
    mark.setAttribute('text-anchor', 'end');
    mark.textContent = word(look.mark);
  }
}
