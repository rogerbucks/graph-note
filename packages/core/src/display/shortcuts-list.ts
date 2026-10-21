// The list of every keyboard shortcut, as the help shows it (editor spec §44, shortcuts_listed). Each place a shortcut
// works has a table. A row gives the keys, what they do, and ⌨ for a command you can give keys of your own. ? on a
// drawing shows it in the card, and a host's own command shows the same list in a dialog. It also says where to give
// a command keys.
import { SHORTCUTS, SHORTCUT_PLACES, word } from '@thoughtknot/core';
import type { Shortcut, WordKey } from '@thoughtknot/core';

/** What a shortcut does, then its keys, in the catalogue's words. */
const does = (s: Shortcut): string => word(`shortcut.${s.id}` as WordKey);
const keysOf = (s: Shortcut): string => word(`shortcut.${s.id}.keys` as WordKey);

/** Puts the list of every keyboard shortcut at the end of `parent`, and gives it back. */
export function listShortcuts(parent: HTMLElement): HTMLElement {
  const list = parent.createDiv({ cls: 'thoughtknot-shortcuts-list' });
  for (const place of SHORTCUT_PLACES) {
    const table = list.createEl('table');
    table.createEl('caption', { text: word(`shortcuts.place.${place}`) });
    for (const s of SHORTCUTS.filter((r) => r.place === place)) {
      const row = table.createEl('tr');
      row.createEl('th', { text: keysOf(s), attr: { scope: 'row' } });
      row.createEl('td', { text: does(s) });
      const mark = row.createEl('td', { cls: 'thoughtknot-shortcut-command' });
      if (s.command) mark.createSpan({ text: '⌨', attr: { role: 'img', 'aria-label': word('shortcuts.command') } });
    }
  }
  list.createEl('p', { cls: 'thoughtknot-quiet', text: word('shortcuts.assign') });
  return list;
}

/**
 * Shows the list in the card `root`, or closes it when it is shown. It takes the keyboard. Escape or its Close button
 * closes it, and the keyboard goes back to `back`.
 */
export function toggleShortcuts(root: HTMLElement, back: HTMLElement): void {
  const open = root.querySelector<HTMLElement>('.thoughtknot-shortcuts');
  if (open) {
    open.remove();
    back.focus({ preventScroll: true });
    return;
  }
  const panel = root.createDiv({
    cls: 'thoughtknot-shortcuts',
    attr: { role: 'dialog', 'aria-label': word('shortcuts.title') },
  });
  panel.createEl('h3', { text: word('shortcuts.title') });
  const close = () => {
    panel.remove();
    back.focus({ preventScroll: true });
  };
  const button = panel.createEl('button', { text: word('shortcuts.close'), attr: { type: 'button' } });
  button.addEventListener('click', close);
  listShortcuts(panel);
  panel.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    close();
  });
  button.focus({ preventScroll: true });
}
