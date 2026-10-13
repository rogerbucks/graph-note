// The search box over a drawing (editor spec §25, untangle_find): typing lists the things whose name or property holds what
// was typed, each with its kind and, for a property, which; choosing one — or pressing Enter for the first — selects it and
// brings it into view, as opening its details does. Searching only reads: nothing is changed in the drawing or the note.
import type { Found } from '@graph-note/core';

/** What the box asks of its card: the things that match, and what to do with the one chosen. */
export interface FindActions {
  search: (query: string) => Found[];
  choose: (found: Found) => void;
}

/** The search row of a card, hidden until the bar's button opens it, and how to put the cursor in its box. */
export interface FindRow {
  el: HTMLElement;
  focus: () => void;
}

/** Builds the search row in a card. */
export function renderFind(root: HTMLElement, on: FindActions): FindRow {
  const el = root.createDiv({ cls: 'graph-note-find', attr: { role: 'search' } });
  el.hidden = true;
  const input = el.createEl('input', {
    attr: {
      type: 'search',
      placeholder: 'Find a thing by name or property',
      'aria-label': 'Find a thing by name or property',
    },
  });
  const list = el.createEl('ul', { cls: 'graph-note-find-results' });
  const none = el.createEl('p', { cls: 'graph-note-quiet', text: 'No thing matches.' });
  none.hidden = true;
  let shown: Found[] = [];
  const run = () => {
    list.empty();
    shown = on.search(input.value);
    none.hidden = shown.length > 0 || !input.value.trim();
    for (const f of shown) {
      const b = list.createEl('li').createEl('button', {
        text: `${f.text} · ${f.kind}${f.via === 'name' ? '' : ` — ${f.via}`}`,
        attr: { type: 'button' },
      });
      b.addEventListener('click', () => on.choose(f));
    }
  };
  input.addEventListener('input', run);
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    const first = shown[0];
    if (e.key === 'Enter' && first) {
      e.preventDefault();
      on.choose(first);
    }
  });
  return { el, focus: () => input.focus() };
}
