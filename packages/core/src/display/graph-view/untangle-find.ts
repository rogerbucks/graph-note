// The search box over a drawing (editor spec §25, untangle_find). Typing lists the things whose name or property holds
// what was typed. Each comes with its kind and, for a property, which. Choosing one, or pressing Enter for the first,
// selects it. It brings it into view, as opening its details does. Escape closes the row. Searching only reads: nothing
// is changed in the drawing or the note.
import { word } from '@thoughtknot/core';
import type { Found } from '@thoughtknot/core';

/** What the box asks of its card: the things that match, what to do with the one chosen, and how to close the row. */
export interface FindActions {
  search: (query: string) => Found[];
  choose: (found: Found) => void;
  /** Escape was pressed in the box: closes the row and gives the focus back to the button that opened it. */
  close: () => void;
}

/** The search row of a card, hidden until the bar's button opens it, and how to put the cursor in its box. */
export interface FindRow {
  el: HTMLElement;
  focus: () => void;
}

/** What is said, for a screen reader, of a search's result: how many were found, or that none matches. */
function said(typed: string, count: number): string {
  if (!typed.trim()) return '';
  return count ? word('find.found', { count }) : word('find.none');
}

/** Builds the search row in a card. */
export function renderFind(root: HTMLElement, on: FindActions): FindRow {
  const el = root.createDiv({ cls: 'thoughtknot-find', attr: { role: 'search' } });
  el.hidden = true;
  const input = el.createEl('input', {
    attr: {
      type: 'search',
      placeholder: word('untangle.find'),
      'aria-label': word('untangle.find'),
    },
  });
  const status = el.createEl('p', { cls: 'thoughtknot-quiet', attr: { role: 'status' } });
  const list = el.createEl('ul', { cls: 'thoughtknot-find-results' });
  let shown: Found[] = [];
  const run = () => {
    list.empty();
    shown = on.search(input.value);
    status.setText(said(input.value, shown.length));
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
    } else if (e.key === 'Escape') {
      e.preventDefault();
      on.close();
    }
  });
  return { el, focus: () => input.focus() };
}
