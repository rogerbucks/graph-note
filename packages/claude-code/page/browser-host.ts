// The browser page's side of the display layer (spec §26, cc_core_only, cc_icons): the icon, phone test, notice and menu the
// shared layer asks its host for, made of plain DOM, as Obsidian's is made of its own. An icon is a span the stylesheet fills
// from an image file the server holds (`/icons/<name>.svg`), so no icon library ships and no icon is ever shown as its name;
// a name with no file shows a plain dashed square. Everything the page says is set as text.
import type { DisplayHost, MenuEntry } from '@graph-note/core/display/host';

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** How long a notice stays, in milliseconds. */
export const NOTICE_MS = 5000;

/** How wide a screen counts as a phone's. */
export const PHONE_WIDTH = '(max-width: 600px)';

/** The class that draws the icon `name`: its own, when the name could be a file's, else none (the dashed square shows). */
export const iconClass = (name: string): string => (NAME.test(name) ? `gn-icon-${name}` : '');

/** Puts the icon `name` into `el`, replacing what it held. */
function drawIcon(el: HTMLElement, name: string): void {
  const span = el.ownerDocument.createElement('span');
  span.setAttribute('class', `gn-icon ${iconClass(name)}`.trim());
  span.setAttribute('aria-hidden', 'true');
  el.replaceChildren(span);
}

/** A menu of `entries`, a list of buttons, closed by a click anywhere else or Escape. */
function showMenu(entries: MenuEntry[], at: { x: number; y: number }, doc: Document): void {
  const menu = doc.createElement('div');
  menu.setAttribute('class', 'gn-menu');
  menu.setAttribute('role', 'menu');
  menu.style.left = `${at.x}px`;
  menu.style.top = `${at.y}px`;
  const close = () => {
    menu.remove();
    doc.removeEventListener('pointerdown', away, true);
    doc.removeEventListener('keydown', escape, true);
  };
  const away = (e: Event) => void (menu.contains(e.target as Node) || close());
  const escape = (e: KeyboardEvent) => void (e.key === 'Escape' && close());
  for (const entry of entries) {
    if (entry === 'separator') {
      const rule = doc.createElement('hr');
      rule.setAttribute('class', 'gn-menu-separator');
      menu.append(rule);
      continue;
    }
    const row = doc.createElement('button');
    row.setAttribute('class', entry.warning ? 'gn-menu-row gn-menu-warning' : 'gn-menu-row');
    row.setAttribute('role', entry.checked === undefined ? 'menuitem' : 'menuitemcheckbox');
    if (entry.checked !== undefined) row.setAttribute('aria-checked', String(entry.checked));
    const icon = doc.createElement('span');
    drawIcon(icon, entry.icon);
    const title = doc.createElement('span');
    title.textContent = entry.title;
    row.append(icon, title);
    row.addEventListener('click', () => {
      close();
      entry.onClick();
    });
    menu.append(row);
  }
  doc.body.append(menu);
  doc.addEventListener('pointerdown', away, true);
  doc.addEventListener('keydown', escape, true);
  menu.querySelector('button')?.focus();
}

/** The host the page installs: the window it runs in decides the phone test and the timers. */
export function browserHost(win: Window): DisplayHost {
  return {
    icon: drawIcon,
    isPhone: () => win.matchMedia(PHONE_WIDTH).matches,
    notice: (message) => {
      const doc = win.document;
      const shelf = doc.getElementById('gn-notices') ?? doc.body.appendChild(doc.createElement('div'));
      shelf.setAttribute('id', 'gn-notices');
      shelf.setAttribute('role', 'status');
      const note = doc.createElement('div');
      note.setAttribute('class', 'gn-notice');
      note.textContent = message;
      shelf.append(note);
      win.setTimeout(() => note.remove(), NOTICE_MS);
    },
    menu: showMenu,
  };
}
