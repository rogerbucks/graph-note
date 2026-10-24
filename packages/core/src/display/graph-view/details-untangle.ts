// What a thing's details offer to untangle the drawing (spec §25), as one rail of controls down the side of its details.
// The details are the same in 2D and in 3D, so the rail is too (Roger, 24 Oct 2026). It offers its neighbourhood alone,
// as a toggle, with one step more or fewer round it, and the shortest path to another thing. For a busy hub, it offers
// folding or opening its links. Its box can be moved too (§6). A graph drawn as a table (§15) has nothing to hide or
// bring forward, so there none of it is offered. Each control is an icon and its words, so it is read at a glance.
import { MOST_STEPS, word } from '@thoughtknot/core';
import type { DiagramShown } from './type-strip';
import type { ThingActions } from './untangle';
import { button } from '../button';

/**
 * The offers for `key` in `el`, as a rail of buttons, if there is anything to offer them to (`on`). Move is offered too
 * when the card is given a way to (`move`). It picks the box up, to move it from the keyboard (§6, move_box_keyboard).
 * Where a radial drawing fits (`diagram`), Centre here is offered first.
 */
export function untangleOffers(
  el: HTMLElement,
  key: string,
  on: ThingActions | undefined,
  move?: (key: string) => void,
  diagram?: DiagramShown,
  text = key,
): void {
  if (!on) return;
  const rail = el.createDiv({
    cls: 'thoughtknot-untangle-offers',
    attr: { role: 'toolbar', 'aria-orientation': 'vertical', 'aria-label': word('details.controls', { thing: text }) },
  });
  const offer = (words: string, icon: string, run: () => void) => button(rail, words, icon, run, words);
  // drawn radial around this thing, from any type, if it is not the centre already (§15, radial_centre_anywhere)
  if (diagram?.putCentre && diagram.canCentre?.(key))
    offer(word('details.centre'), 'locate-fixed', () => diagram.putCentre?.(key));
  // a toggle: pressed again, or while this thing is shown only, it shows the whole graph (untangle_toggle)
  const only = offer(showOnlyWords(key, on.shownOnly?.() ?? null), 'focus', () => on.showOnly(key));
  only.setAttribute('data-show-only', key);
  only.setAttribute('aria-pressed', String(on.shownOnly?.() === key));
  if (on.reach) {
    const sync = reachRow(rail, key, on);
    reachSyncs.set(only, sync);
    sync();
  }
  offer(word('details.shortest-path'), 'route', () => on.routeFrom(key));
  if (move) offer(word('details.move'), 'move', () => move(key));
  // a busy hub's links, folded into one stub or open, folded or opened from its details too (§25, untangle_hubs)
  const hub = on.hub?.(key);
  if (hub)
    offer(
      word(hub.folded ? 'details.open-hub' : 'details.fold-hub', { count: hub.links }),
      hub.folded ? 'unfold-vertical' : 'fold-vertical',
      () => on.toggleHub?.(key),
    );
}

/** How each Show only button brings its row of one step fewer or more up to date, by the button. */
const reachSyncs = new WeakMap<HTMLElement, () => void>();

/**
 * The row of one step fewer or more round `key`, and how far it reaches now, under its Show only button. It gives back
 * how to bring it up to date. Its controls are there only while `key` is shown with its neighbours, so none is offered
 * that does nothing. While they are, they are kept, so the focus stays on the one pressed.
 */
function reachRow(rail: HTMLElement, key: string, on: ThingActions): () => void {
  const row = rail.createDiv({ cls: 'thoughtknot-untangle-reach', attr: { 'data-reach': key } });
  let made: { fewer: HTMLButtonElement; steps: HTMLElement; more: HTMLButtonElement } | null = null;
  return () => {
    const steps = on.shownOnly?.() === key ? (on.reach?.()?.steps ?? null) : null;
    row.hidden = steps === null;
    if (steps === null) {
      row.empty();
      made = null;
      return;
    }
    made ??= {
      fewer: button(row, word('details.fewer-links'), 'minus', () => on.reach?.()?.by(-1)),
      steps: row.createSpan({ cls: 'thoughtknot-untangle-steps', attr: { 'aria-live': 'polite' } }),
      more: button(row, word('details.more-links'), 'plus', () => on.reach?.()?.by(1)),
    };
    made.steps.setText(word('details.reach', { count: steps }));
    made.fewer.disabled = steps <= 1;
    made.more.disabled = steps >= MOST_STEPS;
  };
}

/** What the Show only button of `key` says, with `only` shown alone now: shown alone, it offers the whole graph back. */
const showOnlyWords = (key: string, only: string | null): string =>
  word(only === key ? 'untangle.show-all' : 'details.show-only');

/**
 * Says on each Show only button in `el` what pressing it does now, with `only` shown alone (untangle_toggle). The row
 * of one step more or fewer under it is brought up to date with it.
 */
export function relabelShowOnly(el: HTMLElement, only: string | null): void {
  for (const b of Array.from(el.querySelectorAll<HTMLElement>('button[data-show-only]'))) {
    const words = showOnlyWords(b.getAttribute('data-show-only') ?? '', only);
    b.setAttribute('aria-label', words);
    b.setAttribute('aria-pressed', String(b.getAttribute('data-show-only') === only));
    b.querySelector('.thoughtknot-badge-text')?.setText(words);
    reachSyncs.get(b)?.();
  }
}
