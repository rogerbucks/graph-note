// The search box of a graph too large to draw (editor spec §53, scale_search_fly). Typing lists the things whose names
// match, from every group, as a combobox. Arrows move through the list, Enter or a click chooses, Escape closes it.
// What the overview does with a choice is massive-view.ts: it opens the group and flies there.
import { word } from '@thoughtknot/core';
import type { Match } from '../../search-fly.ts';

/** How many matches the list shows. */
export const LISTED = 8;

/** What the search box needs from the overview it sits in. */
export interface SearchHooks {
  /** The matches for `query`, at most `most`. */
  find(query: string, most: number): Match[];
  /** A group's name, by its id. */
  named(group: string): string;
  choose(match: Match): void;
  say(text: string): void;
}

/** The search box and its list, at the end of `parent`. `id` names the list, for the box to point at. */
export function searchBox(parent: HTMLElement, id: string, h: SearchHooks): void {
  const input = parent.createEl('input', {
    cls: 'thoughtknot-massive-search',
    type: 'search',
    placeholder: word('massive.search'),
    attr: {
      'aria-label': word('massive.search'),
      role: 'combobox',
      'aria-expanded': 'false',
      'aria-controls': `${id}-list`,
      'aria-autocomplete': 'list',
    },
  });
  const list = parent.createEl('ul', { cls: 'thoughtknot-massive-list', attr: { role: 'listbox', id: `${id}-list` } });
  list.hidden = true;
  let matches: Match[] = [],
    active = -1;
  const show = () => {
    list.empty();
    matches.forEach((m, i) => {
      list.createEl('li', {
        text: `${m.text} · ${h.named(m.group)}`,
        attr: { role: 'option', id: `${id}-${i}`, 'aria-selected': i === active ? 'true' : 'false' },
      });
    });
    list.hidden = !matches.length;
    input.setAttribute('aria-expanded', matches.length ? 'true' : 'false');
    if (active >= 0) input.setAttribute('aria-activedescendant', `${id}-${active}`);
    else input.removeAttribute('aria-activedescendant');
  };
  const choose = (i: number) => {
    const m = matches[i];
    if (!m) return;
    matches = [];
    active = -1;
    show();
    h.choose(m);
  };
  input.addEventListener('input', () => {
    matches = h.find(input.value, LISTED);
    active = matches.length ? 0 : -1;
    show();
    h.say(input.value.trim() ? word('massive.found', { count: matches.length }) : '');
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!matches.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length;
      show();
    } else if (e.key === 'Enter') choose(Math.max(0, active));
    else if (e.key === 'Escape' && matches.length) {
      matches = [];
      show();
    } else return;
    e.preventDefault();
  });
  list.addEventListener('click', (e) => {
    const li = (e.target as Element | null)?.closest('li');
    if (li) choose(Array.from(list.children).indexOf(li));
  });
}
