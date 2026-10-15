// The arrow to a selection out of view (editor spec §25, selection_pointer): a button at the edge of the drawing's view,
// on the line from its middle towards the selection and pointing along it, named for what it points to; tapped, it brings
// the selection into view. Where it sits is the core's `pointerTo`; this puts it on the page.
import { setIcon } from '../host';
import type { Pointing } from '@graph-note/core';

/** Whether an event's target is the arrow, which a tap on is never a tap on the drawing. */
export const onPointer = (target: EventTarget | null): boolean =>
  !!(target as Element | null)?.closest?.('.graph-note-pointer');

/** The arrow of one card, made the first time it is needed. */
export class SelectionPointer {
  private readonly viewport: () => HTMLElement;
  private readonly go: () => void;
  private b: HTMLButtonElement | null = null;

  /** For the card's viewport, which the arrow sits in, and what a tap on it does. */
  constructor(viewport: () => HTMLElement, go: () => void) {
    this.viewport = viewport;
    this.go = go;
  }

  /** Shows the arrow where the core puts it, named for the selection; or hides it, when the selection is in view or none. */
  show(at: Pointing | null, name: string): void {
    if (!at) {
      if (this.b) this.b.hidden = true;
      return;
    }
    const b = (this.b ??= this.make());
    b.hidden = false;
    b.setAttribute('aria-label', `Bring ${name} into view`);
    b.setCssProps({
      '--graph-note-pointer-x': `${at.x}px`,
      '--graph-note-pointer-y': `${at.y}px`,
      '--graph-note-pointer-angle': `${at.angle}deg`,
    });
  }

  private make(): HTMLButtonElement {
    const b = this.viewport().createEl('button', {
      cls: ['clickable-icon', 'graph-note-pointer'],
      attr: { type: 'button' },
    });
    setIcon(b, 'arrow-right');
    b.addEventListener('click', () => this.go());
    return b;
  }
}
