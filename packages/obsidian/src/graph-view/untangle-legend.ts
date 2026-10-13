// The legend that untangles (editor spec §25, untangle_legend): every kind of thing and relationship type of the drawing
// as a button; choosing one brings it forward and fades the rest, choosing it again hides it, and once more puts it back.
// Each says where it stands in words as well as by its look, and nothing here is saved with the note.
import type { LegendFilter, LegendItem, LegendState } from '@graph-note/core';

const SAYS: Record<LegendState, string> = { normal: '', forward: ' — in front', hidden: ' — hidden' };
const PRESSED: Record<LegendState, string> = { normal: 'false', forward: 'true', hidden: 'mixed' };

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
    cls: 'graph-note-filter',
    attr: { role: 'group', 'aria-label': 'Kinds and relationship types' },
  });
  el.hidden = true;
  const buttons: { item: LegendItem; b: HTMLButtonElement; says: HTMLElement }[] = [];
  const refresh = () => {
    for (const { item, b, says } of buttons) {
      const state = filter.state(item.id);
      says.setText(SAYS[state]);
      b.setAttribute('aria-pressed', PRESSED[state]);
      b.toggleClass('is-hidden', state === 'hidden');
    }
  };
  if (!items.length) el.createEl('p', { cls: 'graph-note-quiet', text: 'Nothing to filter.' });
  const ul = el.createEl('ul');
  for (const item of items) {
    const b = ul.createEl('li').createEl('button', { cls: `graph-note-filter-${item.what}`, attr: { type: 'button' } });
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
