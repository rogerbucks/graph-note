// What a card is given to follow its links through Obsidian (editor spec §18): a link to a note or file opened by the
// workspace's own link opener, so a modifier-click opens a new tab as anywhere in Obsidian (host_opens_links); a web or
// mail address said plainly to leave Obsidian, and handed to the system only once agreed (safe_to_click); any other link
// never opened; the preview Page preview shows on hover (link_preview); Markdown rendered by Obsidian's own renderer,
// with nothing remote loaded and no HTML (rich_details); and where the card was left, so the back step finds it as it
// was (back_where_you_were). Nothing here fetches anything: every opening is Obsidian's.
import { Keymap, MarkdownRenderer, Modal, Notice, TFile } from 'obsidian';
import type { App, Component } from 'obsidian';
import { leavingWords, linkTo, refusedWords, safeMarkdown } from '@graph-note/core';
import type { BrokenLink, FoundLink } from '@graph-note/core';
import type GraphNotePlugin from '../main';
import { followAnchor } from './links-list';

/** The source the plugin's links are hovered from, as Page preview's settings name it. */
export const HOVER_SOURCE = 'graph-note';

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
  /** Opens a link through Obsidian; `left`, where the card is, is kept when the link takes the card's own tab. */
  open(link: FoundLink, evt?: MouseEvent | KeyboardEvent, left?: LeftAt | null): void;
  /** Shows Obsidian's own preview of a link to a note or file, as a hover over a link in a note does. */
  hover(link: FoundLink, evt: MouseEvent | PointerEvent, el: HTMLElement): void;
  /**
   * Renders Markdown into `el` through Obsidian's renderer, from the graph's note, owned by `owner`; its links follow
   * these rules too, `where` saying where the card is when one of them takes its tab.
   */
  render(markdown: string, el: HTMLElement, owner: Component, where?: () => LeftAt | null): Promise<void>;
  /** Where this card was left when a link took its tab, once: the back step draws it as it was. */
  cameBack(): LeftAt | undefined;
  /** Creates the note a broken link names, or says why not (a write: closed in reading view); whether it is there now. */
  create(target: string): Promise<boolean>;
}

/** Where each card was left, by plugin, then by note and graph: kept while the plugin runs, never saved. */
const LEFT = new WeakMap<object, Map<string, LeftAt>>();

/** Asks before a link that leaves Obsidian is handed to the system; Open hands it over, Cancel does nothing. */
class LeaveObsidian extends Modal {
  constructor(
    app: App,
    private readonly words: string,
    private readonly address: string,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.setTitle('Leave Obsidian?');
    this.contentEl.createEl('p', { text: this.words });
    const row = this.contentEl.createDiv({ cls: 'graph-note-leave-row' });
    row.createEl('button', { text: 'Open', cls: 'mod-cta', attr: { type: 'button' } }).addEventListener('click', () => {
      this.close();
      // handed to Obsidian, which gives an address to the system's browser or mail app; the plugin fetches nothing
      activeWindow.open(this.address, '_blank');
    });
    row.createEl('button', { text: 'Cancel', attr: { type: 'button' } }).addEventListener('click', () => this.close());
  }
}

/**
 * Each link Obsidian rendered inside `el`: one that may not be opened becomes its text; the rest open and preview as the
 * card's own links do, `where` saying where the card is when one takes its tab.
 */
function followRendered(el: HTMLElement, host: LinkHost, where: () => LeftAt | null = () => null): void {
  for (const a of Array.from(el.querySelectorAll('a'))) {
    const link = linkTo(a.getAttribute('data-href') ?? a.getAttribute('href') ?? '');
    if (link.kind !== 'refused') {
      followAnchor(a, link, host, where);
      continue;
    }
    const text = createSpan({ cls: 'graph-note-link-refused', text: a.textContent ?? '' });
    a.parentElement?.insertBefore(text, a);
    a.remove();
  }
}

/** The links of graph `graph` in the note at `path`, followed through Obsidian. */
export function linkHost(plugin: GraphNotePlugin, path: string, graph: string): Omit<LinkHost, 'broken'> {
  const key = `${path}\u0000${graph}`;
  const left = () => LEFT.get(plugin) ?? LEFT.set(plugin, new Map()).get(plugin)!;
  const hoverParent = { hoverPopover: null };
  const host: Omit<LinkHost, 'broken'> = {
    path,
    found: (target) => !!plugin.app.metadataCache.getFirstLinkpathDest(target, path),
    open: (link, evt, at) => {
      if (link.kind === 'refused') {
        new Notice(refusedWords(link));
        return;
      }
      const words = leavingWords(link);
      if (words) {
        new LeaveObsidian(plugin.app, words, link.target).open();
        return;
      }
      const newLeaf = Keymap.isModEvent(evt ?? null);
      if (!newLeaf && at) left().set(key, at); // the link takes this tab: the back step finds the card as it was
      void plugin.app.workspace.openLinkText(link.opens, path, newLeaf);
    },
    hover: (link, evt, el) => {
      if (link.kind !== 'note' && link.kind !== 'file') return;
      plugin.app.workspace.trigger('hover-link', {
        event: evt,
        source: HOVER_SOURCE,
        hoverParent,
        targetEl: el,
        linktext: link.opens,
        sourcePath: path,
      });
    },
    render: async (markdown, el, owner, where) => {
      await MarkdownRenderer.render(plugin.app, safeMarkdown(markdown), el, path, owner);
      followRendered(el, { ...host, broken: [] }, where);
    },
    cameBack: () => {
      const at = left().get(key);
      left().delete(key);
      return at;
    },
    create: async (target) => {
      const name = target.toLowerCase().endsWith('.md') ? target : `${target}.md`;
      const parent = target.includes('/') ? '' : plugin.app.fileManager.getNewFileParent(path, name).path;
      const at = parent && parent !== '/' ? `${parent}/${name}` : name;
      if (plugin.app.vault.getAbstractFileByPath(at) instanceof TFile) return true;
      try {
        await plugin.app.vault.create(at, '');
      } catch (e) {
        new Notice(`The note ${at} could not be made: ${e instanceof Error ? e.message : String(e)}`);
        return false;
      }
      new Notice(`Created the note ${at}.`);
      return true;
    },
  };
  return host;
}

/** The names a vault holds, as a link names them: a note without `.md`, any other file with its extension. */
export function vaultNames(plugin: GraphNotePlugin): string[] {
  return plugin.app.vault.getFiles().map((f) => (f.extension === 'md' ? f.name.slice(0, -3) : f.name));
}
