// What a thing's details offer to untangle the drawing (spec §25): its neighbourhood alone, the shortest path to another
// thing, and, for a busy hub, folding or opening its links. A graph drawn as a table (§15) has nothing to hide or bring
// forward, so there none of it is offered.
import { word } from '@thoughtknot/core';
import type { ThingActions } from './untangle';

/** The offers for `key` in `el`, as buttons, if there is anything to offer them to (`on`). */
export function untangleOffers(el: HTMLElement, key: string, on: ThingActions | undefined): void {
  if (!on) return;
  const row = el.createDiv({ cls: 'thoughtknot-untangle-offers' });
  row
    .createEl('button', { text: word('details.show-only'), attr: { type: 'button' } })
    .addEventListener('click', () => on.showOnly(key));
  row
    .createEl('button', { text: word('details.shortest-path'), attr: { type: 'button' } })
    .addEventListener('click', () => on.routeFrom(key));
  // a busy hub's links, folded into one stub or open, folded or opened from its details too (§25, untangle_hubs)
  const hub = on.hub?.(key);
  if (hub)
    row
      .createEl('button', {
        text: word(hub.folded ? 'details.open-hub' : 'details.fold-hub', { count: hub.links }),
        attr: { type: 'button' },
      })
      .addEventListener('click', () => on.toggleHub?.(key));
}
