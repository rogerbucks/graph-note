// The legend that untangles (editor spec §25, untangle_legend). Every kind of thing and relationship type of the
// drawing is a button. Choosing one brings it forward and fades the rest, choosing it again hides it, and once more
// puts it back. Each says where it stands in words as well as by its look. Nothing here writes to the note. A view's
// Save as shown writes the choices (§25, untangle_legend), and a view saved so opens with them.
import { word } from '@thoughtknot/core';
import type { LegendFilter, LegendItem, LegendState } from '@thoughtknot/core';

const SAYS: Record<LegendState, () => string> = {
  normal: () => '',
  forward: () => word('untangle.in-front'),
  hidden: () => word('untangle.hidden'),
};
// only a line brought forward is pressed in: a hidden one says so in words, and is struck through
const PRESSED: Record<LegendState, string> = { normal: 'false', forward: 'true', hidden: 'false' };

/** The legend panel of a card, hidden until the bar's button opens it, and how to draw its buttons again. */
export interface LegendPanel {
  el: HTMLElement;
  /** Draws each button as the filter now stands, after it was changed from outside the panel. */
  refresh: () => void;
}

/** Builds the panel in a card: a button for each of `items`, which moves its line on in `filter` and tells `changed`. */
export function renderLegend(
  root: HTMLElement,
  items: LegendItem[],
  filter: LegendFilter,
  changed: () => void,
): LegendPanel {
  const el = root.createDiv({
    cls: 'thoughtknot-filter',
    attr: { role: 'group', 'aria-label': word('untangle.legend') },
  });
  el.hidden = true;
  const buttons: { item: LegendItem; b: HTMLButtonElement; says: HTMLElement }[] = [];
  const refresh = () => {
    for (const { item, b, says } of buttons) {
      const state = filter.state(item.id);
      says.setText(SAYS[state]());
      b.setAttribute('aria-pressed', PRESSED[state]);
      b.toggleClass('is-hidden', state === 'hidden');
    }
  };
  if (!items.length) el.createEl('p', { cls: 'thoughtknot-quiet', text: word('untangle.nothing-to-filter') });
  const ul = el.createEl('ul');
  for (const item of items) {
    const b = ul
      .createEl('li')
      .createEl('button', { cls: `thoughtknot-filter-${item.what}`, attr: { type: 'button' } });
    b.createSpan({ text: item.label });
    b.createSpan({ text: ` · ${item.count}` });
    const says = b.createSpan();
    b.addEventListener('click', () => {
      filter.choose(item.id);
      refresh();
      changed();
    });
    buttons.push({ item, b, says });
  }
  refresh();
  return { el, refresh };
}
