// The browser page's side of the display layer (spec §26, cc_core_only, cc_icons). It is the icon, phone test, notice
// and menu the shared layer asks its host for. They are made of plain DOM, as Obsidian's are made of its own. An icon
// is a span the stylesheet fills from an image file the server holds (`/icons/<name>.svg`). So no icon library ships,
// and no icon is ever shown as its name. A name with no file shows a plain dashed square. Everything the page says is
// set as text.
import { word } from '../../core/src/words.ts';
import type { DisplayHost, MenuEntry } from '@thoughtknot/core/display/host';

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
  menu.setAttribute('aria-label', word('page.menu'));
  menu.setAttribute('aria-orientation', 'vertical');
  menu.style.left = `${at.x}px`;
  menu.style.top = `${at.y}px`;
  // the keyboard goes back to where it was when the menu closes, unless a click already put it somewhere else
  const opener = doc.activeElement as HTMLElement | null;
  let open = true;
  const close = (back = true) => {
    if (!open) return;
    open = false;
    menu.remove();
    doc.removeEventListener('pointerdown', away, true);
    doc.removeEventListener('keydown', escape, true);
    if (back) opener?.focus();
  };
  const away = (e: Event) => void (menu.contains(e.target as Node) || close(false));
  const escape = (e: KeyboardEvent) => void (e.key === 'Escape' && close());
  // arrow keys, Home and End walk the rows (the first after the last); Escape and Tab leave the menu
  menu.addEventListener('keydown', (e) => {
    const rows = Array.from(menu.querySelectorAll<HTMLElement>('button'));
    const now = rows.indexOf(doc.activeElement as HTMLElement);
    const moves: Record<string, number> = { ArrowDown: now + 1, ArrowUp: now - 1, Home: 0, End: rows.length - 1 };
    const to = Object.hasOwn(moves, e.key) ? moves[e.key] : undefined;
    if (to !== undefined) rows[(to + rows.length) % rows.length]?.focus();
    else if (e.key !== 'Escape' && e.key !== 'Tab') return;
    else close();
    e.preventDefault();
  });
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
    // the page's policy allows no inline style (cc_csp): a drawing's colours are set through the CSSOM instead
    noInlineStyle: true,
    language: () => win.navigator?.language || 'en-GB',
  };
}
