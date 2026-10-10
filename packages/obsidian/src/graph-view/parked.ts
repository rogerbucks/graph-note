// Things parked for later (spec §5, park_for_later, deferred_drawn; §8, parked_not_broken): each thing a Deferred defers
// drawn dashed with a later mark — on the drawing Graphviz drew, so its layout stays the Python library's — and said so
// to screen readers; the parked things listed behind the badge; and, while the card is edited, Park for later in a
// box's details, which writes a Deferred saying what is needed and why it waits.
import { indentText, parkForLater } from '@graph-note/core';
import type { Box, Indent, Parked } from '@graph-note/core';
import { button } from './view-bar';

const SVG = 'http://www.w3.org/2000/svg';

/** The corners of a box as Graphviz drew it, from the numbers of its outline. */
function cornerOf(g: Element): { right: number; top: number } | null {
  const shape = g.querySelector('path, polygon');
  const nums = (shape?.getAttribute('d') ?? shape?.getAttribute('points') ?? '').match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 4) return null;
  const xs = nums.filter((_, i) => i % 2 === 0).map(Number),
    ys = nums.filter((_, i) => i % 2 === 1).map(Number);
  return { right: Math.max(...xs), top: Math.min(...ys) };
}

/** Marks each parked box of a drawing: dashed, a mark in words and a sign at its top right, and its name said so. */
export function markParked(svg: SVGSVGElement, boxes: Box[]): void {
  for (const g of Array.from(svg.querySelectorAll('g.node'))) {
    const box = boxes.find((b) => b.key === g.getAttribute('data-key'));
    if (!box?.deferred) continue;
    const overdue = box.deferred.overdue;
    g.classList.add('graph-note-parked');
    g.classList.toggle('is-overdue', overdue);
    const said = overdue ? 'parked for later, overdue' : 'parked for later';
    g.setAttribute('aria-label', `${g.getAttribute('aria-label') ?? box.text}, ${said}: ${box.deferred.what}`);
    const at = cornerOf(g);
    if (!at) continue;
    const mark = g.appendChild(activeDocument.createElementNS(SVG, 'text'));
    mark.setAttribute('class', 'graph-note-later-mark');
    mark.setAttribute('x', String(at.right - 4));
    mark.setAttribute('y', String(at.top + 10));
    mark.setAttribute('text-anchor', 'end');
    mark.textContent = overdue ? '⏳ overdue' : '⏳ later';
  }
}

/** The parked things behind the badge, each with what is needed, why it waits, and when to look again. */
export function listParked(el: HTMLElement, parked: Map<string, Parked>, textOf: (key: string) => string): void {
  if (!parked.size) return;
  el.createEl('h4', { text: 'Parked for later' });
  const ul = el.createEl('ul', { cls: 'graph-note-parked-list' });
  for (const [key, p] of parked) {
    const when = p.revisitBy ? `, revisit by ${p.revisitBy}` : '';
    ul.createEl('li', {
      cls: p.overdue ? 'is-overdue' : '',
      text: `⏳ ${p.overdue ? 'Overdue' : 'Parked'} — ${textOf(key)}: ${p.what || 'what is needed is not said'}${p.why ? ` (${p.why})` : ''}${when}`,
    });
  }
}

/** What the details of a parked box say of it. */
export function parkedNote(el: HTMLElement, box: Box | undefined): void {
  if (!box?.deferred) return;
  el.createEl('p', {
    cls: 'graph-note-parked-note',
    text: `⏳ ${box.deferred.overdue ? 'Parked for later, and overdue' : 'Parked for later'}: ${box.deferred.what}`,
  });
}

/**
 * Park for later, in a box's details while its block is edited: a button that opens a small form — what is needed, why
 * it waits, and when to look again — which writes the Deferred into the text being edited, or says what is missing.
 */
export function parkButton(
  el: HTMLElement,
  key: string,
  text: () => string,
  replace: (next: string) => void,
  indent: Indent,
): void {
  const holder = el.createDiv({ cls: 'graph-note-park' });
  button(holder, 'Park for later', 'clock', () => {
    holder.empty();
    const input = (label: string, type = 'text') =>
      holder.createEl('input', { attr: { type, 'aria-label': label, placeholder: label } });
    const what = input('What is needed'),
      why = input('Why it waits'),
      by = input('Revisit by', 'date');
    const said = holder.createDiv({ attr: { role: 'alert' } });
    button(holder, 'Park it', 'check', () => {
      try {
        const park = { what: what.value, why: why.value, ...(by.value ? { revisitBy: by.value } : {}) };
        replace(parkForLater(text(), key, park, indentText(indent)));
      } catch (e) {
        said.setText(String((e as Error).message));
      }
    });
  });
}
