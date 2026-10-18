// Obsidian's side of the display layer (`@thoughtknot/core/display/host`). The layer asks its host for the icons, the
// phone test, the notice and the menu. Here they are made of Obsidian's own `setIcon`, `Platform`, `Notice` and `Menu`. Installed once, when the
// plugin loads, before anything is drawn.
import { getLanguage, Menu, Notice, Platform, setIcon } from 'obsidian';
import { installHost } from '@thoughtknot/core/display/host';

/** Installs Obsidian as the host the display layer draws in. */
export function installObsidianHost(): void {
  installHost({
    icon: (el, name) => setIcon(el, name),
    isPhone: () => Platform.isPhone,
    notice: (message) => {
      new Notice(message);
    },
    menu: (entries, at, doc) => {
      const m = new Menu();
      for (const e of entries) {
        if (e === 'separator') {
          m.addSeparator();
          continue;
        }
        m.addItem((item) => {
          item.setTitle(e.title).setIcon(e.icon);
          if (e.checked !== undefined) item.setChecked(e.checked);
          if (e.warning) item.setWarning(true);
          item.onClick(e.onClick);
        });
      }
      m.showAtPosition(at, doc);
    },
    language: () => getLanguage(),
  });
}
