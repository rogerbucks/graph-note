// Things parked for later (spec §5, park_for_later, deferred_drawn; §8, parked_not_broken). Each thing a Deferred
// defers is drawn dashed with a later mark, and said so to screen readers. That is on the drawing Graphviz drew, so its
// layout stays the Python library's. The parked things are listed behind the badge. While the card is edited, Park for
// later is in a box's details, which writes a Deferred saying what is needed and why it waits.
import { DeferredNotDeclared, indentText, parkForLater, word } from '@thoughtknot/core';
import type { Box, Indent, NoteReading, Parked } from '@thoughtknot/core';

/** A graph as the whole note reads it. */
type Graph = NoteReading['whole'][string];
import type { DeclaredDeferred } from './view-options';
import { button } from '../button';

const SVG = 'http://www.w3.org/2000/svg';
/** The button that writes Deferred and DEFERS into the schema when Park it was refused for lacking them. */
const DECLARE = () => word('parked.declare');

/** The edges of a box as Graphviz drew it, from the numbers of its outline: where a mark is put on it. */
export function cornerOf(g: Element): { left: number; right: number; top: number } | null {
  const shape = g.querySelector('path, polygon');
  const nums = (shape?.getAttribute('d') ?? shape?.getAttribute('points') ?? '').match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 4) return null;
  const xs = nums.filter((_, i) => i % 2 === 0).map(Number),
    ys = nums.filter((_, i) => i % 2 === 1).map(Number);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys) };
}

/** Marks each parked box of a drawing: dashed, a mark in words and a sign at its top right, and its name said so. */
export function markParked(svg: SVGSVGElement, boxes: Box[]): void {
  for (const g of Array.from(svg.querySelectorAll('g.node'))) {
    const box = boxes.find((b) => b.key === g.getAttribute('data-key'));
    if (!box?.deferred) continue;
    const overdue = box.deferred.overdue;
    g.classList.add('thoughtknot-parked');
    g.classList.toggle('is-overdue', overdue);
    const said = overdue ? word('parked.said-overdue') : word('parked.said');
    g.setAttribute('aria-label', `${g.getAttribute('aria-label') ?? box.text}, ${said}: ${box.deferred.what}`);
    const at = cornerOf(g);
    if (!at) continue;
    const mark = g.appendChild(activeDocument.createElementNS(SVG, 'text'));
    mark.setAttribute('class', 'thoughtknot-later-mark');
    mark.setAttribute('x', String(at.right - 4));
    mark.setAttribute('y', String(at.top + 10));
    mark.setAttribute('text-anchor', 'end');
    mark.textContent = overdue ? word('parked.mark-overdue') : word('parked.mark');
  }
}

/** The parked things behind the badge, each with what is needed, why it waits, and when to look again. */
export function listParked(el: HTMLElement, parked: Map<string, Parked>, textOf: (key: string) => string): void {
  if (!parked.size) return;
  el.createEl('h4', { text: word('parked.heading') });
  const ul = el.createEl('ul', { cls: 'thoughtknot-parked-list' });
  for (const [key, p] of parked) {
    const when = p.revisitBy ? word('parked.revisit', { day: p.revisitBy }) : '';
    ul.createEl('li', {
      cls: p.overdue ? 'is-overdue' : '',
      text: word(p.overdue ? 'parked.row-overdue' : 'parked.row', {
        name: textOf(key),
        what: p.what || word('parked.what-unsaid'),
        why: p.why ? word('parked.why', { why: p.why }) : '',
        when,
      }),
    });
  }
}

/** What the details of a parked box say of it. */
export function parkedNote(el: HTMLElement, box: Box | undefined): void {
  if (!box?.deferred) return;
  el.createEl('p', {
    cls: 'thoughtknot-parked-note',
    text: word(box.deferred.overdue ? 'parked.note-overdue' : 'parked.note', { what: box.deferred.what }),
  });
}

/**
 * Park for later, in a box's details while its block is edited. It is a button that opens a small form: what is needed,
 * why it waits, and when to look again. The form writes the Deferred into the text being edited, or says what is
 * missing. In a locked graph whose schema lacks Deferred and DEFERS, the refusal comes with a button. It `declare`s
 * them in the schema and then parks, with what was typed in the form kept.
 */
export function parkButton(
  el: HTMLElement,
  key: string,
  text: () => string,
  replace: (next: string) => void,
  indent: Indent,
  graph: string,
  declare: (() => Promise<DeclaredDeferred>) | undefined,
  /**
   * The note as it is now, with what is typed. The thing is found in it, and one only suggested in it is not parked
   * until its name is written (§4). Never the card's drawing, which can be older than the note.
   */
  now: () => NoteReading,
): void {
  const holder = el.createDiv({ cls: 'thoughtknot-park' });
  button(holder, word('parked.park'), 'clock', () => {
    holder.empty();
    // each field with its words beside it, never a placeholder alone
    const input = (label: string, type = 'text') =>
      holder.createEl('label', { text: label }).createEl('input', { attr: { type, 'aria-label': label } });
    const what = input(word('parked.what')),
      why = input(word('parked.why-waits')),
      by = input(word('parked.revisit-by'), 'date');
    what.focus(); // the button pressed is gone: the focus goes to the first field, never nowhere
    const said = holder.createDiv({ attr: { role: 'alert' } });
    const fix = holder.createDiv();
    // the block with the Deferred written into it, from the form as it is now; throws why it cannot
    const parked = (block: string, whole?: Graph) => {
      const park = { what: what.value, why: why.value, ...(by.value ? { revisitBy: by.value } : {}) };
      const reading = now();
      return parkForLater(block, key, park, reading, indentText(indent), whole ?? reading.whole[graph]);
    };
    const refused = (e: unknown) => said.setText(String((e as Error).message));
    const parkIt = button(holder, word('parked.park-it'), 'check', () => {
      fix.empty();
      try {
        replace(parked(text()));
      } catch (e) {
        refused(e);
        if (declare && e instanceof DeferredNotDeclared) {
          const again = button(fix, DECLARE(), 'check', () => void declareAndPark(declare, again), DECLARE());
        }
      }
    });
    let busy = false; // a second press, while the first is at work or after it parked, does nothing: parked once
    async function declareAndPark(
      declareIt: () => Promise<DeclaredDeferred>,
      pressed: HTMLButtonElement,
    ): Promise<void> {
      if (busy) return;
      busy = pressed.disabled = true;
      try {
        // the form as it is now is checked first, so nothing is declared for a park that would fail
        try {
          replace(parked(text()));
        } catch (e) {
          if (!(e instanceof DeferredNotDeclared)) throw e;
          const declared = await declareIt();
          replace(parked(declared.text, declared.whole));
        }
        fix.empty();
        said.setText('');
        parkIt.focus(); // the button pressed is gone: the focus goes to the button before it, never nowhere
      } catch (e) {
        refused(e);
        busy = pressed.disabled = false; // refused: pressed again, once the form is put right
      }
    }
  });
}
