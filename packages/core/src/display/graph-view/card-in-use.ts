// The drawing last used (editor spec §44, shortcuts_listed). A host offers the drawing's own commands as its commands
// too, so a person can give them keys of their own. Each acts on the card the focus or a press last went into, while
// that card is still on the page.
import type { Lifecycle } from '../lifecycle';

/** What a host's commands can do to the drawing last used. */
export interface CardActions {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  /** Opens the card full screen, or, for a full-screen card, closes it. */
  fullScreen: () => void;
  /** Shows every keyboard shortcut in the card, or closes the list. */
  shortcuts: () => void;
}

let used: { root: HTMLElement; actions: CardActions } | null = null;

/** The drawing last used, while it is still on the page; null when none is. */
export const cardInUse = (): CardActions | null => (used?.root.isConnected ? used.actions : null);

/** Makes the card drawn in `root` the one in use each time the focus or a press goes into it, while `card` is loaded. */
export function trackUse(card: Lifecycle, root: HTMLElement, actions: CardActions): void {
  const mark = () => (used = { root, actions });
  card.registerDomEvent(root, 'focusin', mark);
  card.registerDomEvent(root, 'pointerdown', mark);
  card.register(() => {
    if (used?.root === root) used = null;
  });
}
