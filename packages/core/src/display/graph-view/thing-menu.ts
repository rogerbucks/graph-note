// The menu a right-click on a thing opens (spec §15, radial_centre_menu). The menu key or Shift+F10 on its box opens it
// from the keyboard. It holds what can be done with that thing from where the pointer is: for now, Centre here, which
// draws the graph radial around it. It opens beside the pointer, its first item given the focus. The arrow keys move
// between its items. Escape, a press outside it, or an item chosen closes it. Only a menu with something in it opens,
// so where nothing can be done the host keeps its own menu.
import { word } from '@thoughtknot/core';
import type { Lifecycle } from '../lifecycle';

/** One thing the menu offers: what it says, and what it does. */
export interface MenuItem {
  text: string;
  run: () => void;
}

/** The menu on a thing, opened at most one at a time on a card. */
export class ThingMenu {
  private el: HTMLElement | null = null;
  private from: HTMLElement | null = null;

  /** For the card whose element is `root`, which the menu is put in. A press outside it closes it. */
  constructor(
    card: Lifecycle,
    private readonly root: HTMLElement,
  ) {
    card.register(() => this.hide());
    const outside = (e: Event) => {
      if (this.el && !this.el.contains(e.target as Node | null)) this.hide();
    };
    card.registerDomEvent(root.doc, 'pointerdown', outside, { capture: true });
  }

  /**
   * Opens the menu of thing `thing` at `at`, on the page, with `items`. The focus goes back to `from` as it closes.
   * Returns whether it opened: never with nothing to offer.
   */
  show(at: { x: number; y: number }, thing: string, items: MenuItem[], from: HTMLElement | null): boolean {
    this.hide();
    if (!items.length) return false;
    const el = this.root.createDiv({
      cls: 'thoughtknot-thing-menu',
      attr: { role: 'menu', 'aria-label': word('menu.thing', { thing }) },
    });
    const buttons = items.map((item) => {
      const b = el.createEl('button', { text: item.text, attr: { type: 'button', role: 'menuitem' } });
      b.addEventListener('click', () => {
        this.hide();
        item.run();
      });
      return b;
    });
    el.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.hide(true);
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const now = buttons.indexOf(activeDocument.activeElement as HTMLButtonElement),
        step = e.key === 'ArrowDown' ? 1 : -1;
      buttons[(now + step + buttons.length) % buttons.length]?.focus();
    });
    // kept inside the window, as far as its size allows
    const size = el.getBoundingClientRect(),
      win = activeWindow;
    const x = Math.max(0, Math.min(at.x, (win.innerWidth || Infinity) - size.width)),
      y = Math.max(0, Math.min(at.y, (win.innerHeight || Infinity) - size.height));
    el.setCssProps({ '--thoughtknot-menu-x': `${x}px`, '--thoughtknot-menu-y': `${y}px` });
    this.el = el;
    this.from = from;
    buttons[0]?.focus({ preventScroll: true });
    return true;
  }

  /** Closes the menu, if open; with `refocus`, the focus goes back to the box it was opened on. */
  hide(refocus = false): void {
    this.el?.remove();
    this.el = null;
    if (refocus) this.from?.focus({ preventScroll: true });
    this.from = null;
  }
}
