// Filters with counts on the overview of a graph too large to draw (editor spec §53, scale_facet_counts). A Filter
// button opens a list for each facet: the things' kinds, then each property that sorts them. Beside each value is how
// many things it holds, under the other filters already chosen. Ticking values keeps only those things, and the
// overview is drawn again from them. The counts are core facet-counts.ts.
import { formatCount, word } from '@thoughtknot/core';
import type { Chosen, FacetIndex } from '../../facet-counts.ts';
import { button } from '../button';

/**
 * The Filter button and its lists, at the end of `parent`. `changed` is given what is chosen, each time it changes.
 * Gives back how to tick the values of an earlier choice again, as when going back along the trail.
 */
export function filterPanel(
  parent: HTMLElement,
  index: FacetIndex,
  changed: (chosen: Chosen) => void,
): { set(chosen: Chosen): void } {
  const panel = parent.createDiv({ cls: 'thoughtknot-massive-filters' });
  panel.hidden = true;
  const toggle = button(
    parent,
    word('massive.filter'),
    'filter',
    () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
    },
    word('massive.filter'),
  );
  toggle.setAttribute('aria-expanded', 'false');
  parent.insertBefore(toggle, panel);
  let chosen: Record<string, Set<string>> = {};
  const counted = new Map<string, HTMLElement>();
  const boxes = new Map<string, HTMLInputElement>();

  const recount = () => {
    for (const [facet, values] of index.counts(chosen))
      for (const { value, count } of values) counted.get(`${facet}\n${value}`)?.setText(formatCount(count));
  };
  for (const [facet, values] of index.counts({})) {
    const group = panel.createEl('fieldset', { cls: 'thoughtknot-massive-facet' });
    group.createEl('legend', { text: facet });
    for (const { value } of values) {
      const label = group.createEl('label');
      const box = label.createEl('input', { type: 'checkbox' });
      boxes.set(`${facet}\n${value}`, box);
      label.createSpan({ text: value });
      counted.set(`${facet}\n${value}`, label.createSpan({ cls: 'thoughtknot-massive-count' }));
      box.addEventListener('change', () => {
        const set = (chosen[facet] ??= new Set());
        if (box.checked) set.add(value);
        else set.delete(value);
        recount();
        changed(chosen);
      });
    }
  }
  recount();
  return {
    set(now) {
      chosen = Object.fromEntries(Object.entries(now).map(([k, v]) => [k, new Set(v)]));
      for (const [at, box] of boxes) {
        const [facet = '', value = ''] = at.split('\n');
        box.checked = chosen[facet]?.has(value) ?? false;
      }
      recount();
    },
  };
}
