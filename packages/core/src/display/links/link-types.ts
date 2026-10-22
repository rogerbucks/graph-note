// What a card is given to follow its links (editor spec §18), as the display layer sees it. The host decides how a link
// is opened, previewed and rendered; the Obsidian plugin's `link-host.ts` does it through Obsidian. The layer draws the
// links and calls these.
import type { BrokenLink, FoundLink } from '@thoughtknot/core';
import type { Lifecycle } from '../lifecycle';

/** Where a card was left when a link took its place: its zoom, where it was panned, and the thing selected. */
export interface LeftAt {
  zoom: number;
  x: number;
  y: number;
  selected?: string;
}

/** What a card is given to show and follow its links: each a read, but `create`, which writes a note. */
export interface LinkHost {
  /** The note the graph is written in, which every link is found from. */
  path: string;
  /** The links of the graph that name nothing in the vault, each with its problem and what it most likely meant. */
  broken: BrokenLink[];
  /** Whether a link to a note or file finds one in the vault. */
  found(target: string): boolean;
  /** Opens a link through the host; `left`, where the card is, is kept when the link takes the card's own tab. */
  open(link: FoundLink, evt?: MouseEvent | KeyboardEvent, left?: LeftAt | null): void;
  /**
   * Opens a link to a note in a pane of the host's own beside the graph, to read and edit there (§25,
   * note_open_beside). Not set: the host has no such pane, and a thing's note offers only to open it.
   */
  openBeside?(link: FoundLink): void;
  /** Shows the host's own preview of a link to a note or file, as a hover over a link in a note does. */
  hover(link: FoundLink, evt: MouseEvent | PointerEvent, el: HTMLElement): void;
  /**
   * Renders Markdown into `el` through the host's renderer, from the graph's note, owned by `owner`. Its links follow
   * these rules too, `where` saying where the card is when one of them takes its tab.
   */
  render(markdown: string, el: HTMLElement, owner: Lifecycle, where?: () => LeftAt | null): Promise<void>;
  /** Where this card was left when a link took its tab, once: the back step draws it as it was. */
  cameBack(): LeftAt | undefined;
  /** Creates the note a broken link names, or says why not (a write: closed in reading view); whether it is there now. */
  create(target: string): Promise<boolean>;
}
