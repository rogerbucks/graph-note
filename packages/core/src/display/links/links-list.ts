// The links and attachments in a box's or a link's details (editor spec §18), on the card and in the inspector alike.
// Each link is a link (links_shown), opened by Obsidian (host_opens_links), from the keyboard too (links_by_keyboard).
// It has Obsidian's preview on hover or, on a touch screen, a long press (link_preview). One that may not be opened is
// shown as text (safe_to_click). One that names nothing is marked broken, with its fixes (broken_links_problems). They
// are Create the note and Change it to what it most likely meant. A thing's attachments show by name and type
// (attachments_at_a_glance).
import { linkTo, refusedWords, word } from '@thoughtknot/core';
import type { Attachment, BrokenLink, FoundLink, PlacedLink } from '@thoughtknot/core';
import type { LeftAt, LinkHost } from './link-types';

/** How long a finger rests on a link before Obsidian's preview of it is shown, as a long press. */
const LONG_PRESS_MS = 500;

/**
 * A link put in `parent`. It is an anchor the Tab key reaches, opened by Obsidian on a click or Enter. It is previewed
 * on hover and on a long press. `where` says where the card is, for the back step, when the link takes its tab.
 */
export function linkAnchor(
  parent: HTMLElement,
  link: FoundLink,
  host: LinkHost,
  where: () => LeftAt | null,
  text = link.label,
): HTMLAnchorElement {
  const vault = link.kind === 'note' || link.kind === 'file';
  const a = parent.createEl('a', {
    text,
    cls: ['thoughtknot-link', vault ? 'is-internal' : 'is-external'],
    attr: { href: link.opens, 'aria-label': word(vault ? 'links.open' : 'links.open-outside', { target: link.opens }) },
  });
  followAnchor(a, link, host, where);
  return a;
}

/** Set on an anchor once it follows its link as the card's own do, so it is never made to twice. */
export const FOLLOWED = 'data-thoughtknot-followed';

/**
 * An anchor on the page made to follow `link` as the card's own links do. It is opened by Obsidian on a click, a
 * middle-click or Enter, never by the browser. It is previewed on hover, and on a touch screen by a long press. That
 * press then opens nothing. An address outside the vault is kept in `data-href`, the anchor's own `href` going nowhere
 * (`#`). Its context menu is kept closed. So no middle-click, menu or drag hands it to the browser past the dialog
 * (safe_to_click).
 */
export function followAnchor(a: HTMLElement, link: FoundLink, host: LinkHost, where: () => LeftAt | null): void {
  a.setAttribute(FOLLOWED, '');
  const vault = link.kind === 'note' || link.kind === 'file';
  if (!vault) {
    a.setAttribute('data-href', link.opens);
    a.setAttribute('href', '#');
    a.addEventListener('contextmenu', (evt) => evt.preventDefault());
  }
  a.addEventListener('auxclick', (evt) => {
    evt.preventDefault();
    if (evt.button === 1) host.open(link, evt, where());
  });
  let pressed = false,
    timer: number | null = null;
  const stop = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  };
  const open = (evt: MouseEvent | KeyboardEvent) => {
    evt.preventDefault();
    host.open(link, evt, where());
  };
  a.addEventListener('click', (evt) => {
    if (pressed) {
      // the press that showed the preview opens nothing
      evt.preventDefault();
      pressed = false;
      return;
    }
    open(evt);
  });
  a.addEventListener('keydown', (evt) => {
    if (evt.key === 'Enter') open(evt);
  });
  a.addEventListener('mouseover', (evt) => host.hover(link, evt, a));
  a.addEventListener('pointerdown', (evt) => {
    if (evt.pointerType !== 'touch') return;
    pressed = false;
    stop();
    timer = window.setTimeout(() => {
      timer = null;
      pressed = true;
      host.hover(link, evt, a);
    }, LONG_PRESS_MS);
  });
  for (const end of ['pointerup', 'pointercancel', 'pointerleave'] as const) a.addEventListener(end, stop);
}

/** What a card can do to fix a broken link: write a block of its note while it is as drawn. Undefined where it cannot. */
export type WriteBlock = ((block: number, was: string, now: string) => Promise<string | null>) | undefined;

/** A broken link marked so, and its fixes, where the card may write: create the note, or change it to what it meant. */
function fixes(li: HTMLElement, a: HTMLElement, broken: BrokenLink, s: LinksShown): void {
  const { host, texts, write, meant } = s;
  a.addClass('is-unresolved');
  li.appendText(word('links.names-nothing'));
  if (s.readOnly()) return;
  const row = li.createDiv({ cls: 'thoughtknot-link-fixes' });
  const fixed = () => {
    a.removeClass('is-unresolved');
    row.remove();
  };
  if (broken.link.kind === 'note')
    row
      .createEl('button', { text: word('links.create', { target: broken.link.target }), attr: { type: 'button' } })
      .addEventListener('click', () => void host.create(broken.link.target)?.then((made) => made && fixed()));
  const at = broken.problem.block,
    was = texts[at];
  for (const m of broken.meant) {
    const now = was === undefined ? null : meant(broken, m);
    if (!write || now === null || was === undefined) continue;
    row
      .createEl('button', { text: word('links.change', { target: m }), attr: { type: 'button' } })
      .addEventListener('click', () => void write(at, was, now)?.then((why) => (why ? undefined : fixed())));
  }
}

/**
 * What the details are given to list links. They get the host, the blocks as drawn, how to write one of them, and where
 * the card is. They get a block with a broken link changed to what it meant. They get whether the card is read-only,
 * where no fix is offered.
 */
export interface LinksShown {
  host: LinkHost;
  texts: string[];
  write: WriteBlock;
  where: () => LeftAt | null;
  meant: (b: BrokenLink, m: string) => string | null;
  readOnly: () => boolean;
}

/** The links a box or link holds, each a link, and a thing's attachments, by name and type. */
export function renderLinks(el: HTMLElement, held: PlacedLink[], attachments: Attachment[], s: LinksShown): void {
  if (held.length) {
    el.createEl('h4', { text: word('links.title') });
    const ul = el.createEl('ul', { cls: 'thoughtknot-link-list' });
    for (const { property, link } of held) {
      const li = ul.createEl('li');
      li.appendText(`${property}: `);
      if (link.kind === 'refused') {
        li.createSpan({ cls: 'thoughtknot-link-refused', text: refusedWords(link) });
        continue;
      }
      const a = linkAnchor(li, link, s.host, s.where);
      const broken = s.host.broken.find((b) => b.link.written === link.written && b.property === property);
      if (broken) fixes(li, a, broken, s);
    }
  }
  if (!attachments.length) return;
  el.createEl('h4', { text: word('links.attachments', { count: attachments.length }) });
  const ul = el.createEl('ul', { cls: 'thoughtknot-attachment-list' });
  for (const f of attachments) {
    const li = ul.createEl('li');
    linkAnchor(li, linkTo(f.target), s.host, s.where, f.name);
    li.appendText(` — ${f.type}`);
  }
}
