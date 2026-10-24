// Every keyboard shortcut, in Obsidian (editor spec §44, shortcuts_listed). A command shows the list in a dialog, the
// same list ? shows on a drawing. The drawing's own commands are Obsidian commands too, with no keys of their own. So a
// person gives them keys in Obsidian's Hotkeys settings. Each acts on the drawing last used, and is offered only
// while there is one.
import { Modal } from 'obsidian';
import type { App } from 'obsidian';
import { SHORTCUTS, word } from '@thoughtknot/core';
import type { WordKey } from '@thoughtknot/core';
import { cardInUse } from '@thoughtknot/core/display/graph-view/card-in-use';
import type { CardActions } from '@thoughtknot/core/display/graph-view/card-in-use';
import { listShortcuts } from '@thoughtknot/core/display/shortcuts-list';
import type { HostCommand } from './host-commands';

/** What each of the drawing's commands does to the drawing last used, by the shortcut's id. */
const ACTIONS: Record<string, keyof Omit<CardActions, 'shortcuts'>> = {
  'zoom-in': 'zoomIn',
  'zoom-out': 'zoomOut',
  fit: 'fit',
  'full-screen': 'fullScreen',
};

/** The dialog with every keyboard shortcut. */
class ShortcutsDialog extends Modal {
  constructor(app: App) {
    super(app);
  }

  override onOpen(): void {
    this.setTitle(word('shortcuts.title'));
    listShortcuts(this.contentEl.createDiv({ cls: 'thoughtknot-shortcuts' }));
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}

/** The command that lists every keyboard shortcut, and the drawing's commands a person can give keys to. */
export function shortcutCommands(app: App): HostCommand[] {
  const drawing = SHORTCUTS.flatMap((s): HostCommand[] => {
    const action = ACTIONS[s.id];
    if (!s.command || !action) return [];
    return [
      {
        id: s.id,
        title: word(`shortcut.${s.id}` as WordKey),
        available: () => !!cardInUse(),
        run: () => cardInUse()?.[action](),
      },
    ];
  });
  return [
    ...drawing,
    { id: 'shortcuts', title: word('shortcut.shortcuts'), run: () => new ShortcutsDialog(app).open() },
  ];
}
