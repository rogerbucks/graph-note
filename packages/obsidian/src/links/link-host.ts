// What a card is given to follow its links through Obsidian (editor spec §18).
// - A link to a note or file is opened by the workspace's own link opener. So a modifier-click opens a new tab, as
//   anywhere in Obsidian (host_opens_links).
// - A web or mail address is said plainly to leave Obsidian. It is handed to the system only once agreed
//   (safe_to_click).
// - Any other link is never opened.
// - The preview Page preview shows on hover (link_preview).
// - Markdown rendered by Obsidian's own renderer, with nothing remote loaded and no HTML (rich_details).
// - Where the card was left, so the back step finds it as it was (back_where_you_were).
// Nothing here fetches anything: every opening is Obsidian's.
import { Component, Keymap, MarkdownRenderer, Modal, Notice, TFile } from 'obsidian';
import type { App } from 'obsidian';
import { readInHostDirection } from '@thoughtknot/core/display/host';
import {
  embedParts,
  embeddedMarkdown,
  leavingWords,
  linkKind,
  linkTo,
  refusedWords,
  safeMarkdown,
  word,
} from '@thoughtknot/core';
import type { LeftAt, LinkHost } from '@thoughtknot/core/display/links/link-types';
import { FOLLOWED, followAnchor } from '@thoughtknot/core/display/links/links-list';
import type ThoughtKnotPlugin from '../main';

/** The source the plugin's links are hovered from, as Page preview's settings name it. */
export const HOVER_SOURCE = 'thoughtknot';

export type { LeftAt, LinkHost };

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
    readInHostDirection(this.modalEl);
    this.setTitle(word('leave.title'));
    // where it goes, first and large: the web site's host, or whom a mail is written to
    let where = '';
    try {
      where = new URL(this.address).host;
    } catch {
      where = '';
    }
    const shown = where || this.address.replace(/^mailto:/i, '').split('?')[0] || this.address;
    this.contentEl.createEl('p', { cls: 'thoughtknot-leave-host', text: shown });
    this.contentEl.createEl('p', { text: this.words });
    const row = this.contentEl.createDiv({ cls: 'thoughtknot-leave-row' });
    row
      .createEl('button', { text: word('leave.open'), cls: 'mod-cta', attr: { type: 'button' } })
      .addEventListener('click', () => {
        this.close();
        // handed to Obsidian, which gives an address to the system's browser or mail app; the plugin fetches nothing
        activeWindow.open(this.address, '_blank');
      });
    row
      .createEl('button', { text: word('leave.cancel'), attr: { type: 'button' } })
      .addEventListener('click', () => this.close());
  }
}

/**
 * Each link Obsidian rendered inside `el` not yet followed. One that may not be opened, by its `href` or its
 * `data-href`, becomes its text. The rest open and preview as the card's own links do. `where` says where the card is
 * when one takes its tab.
 */
function followRendered(el: HTMLElement, host: LinkHost, where: () => LeftAt | null = () => null): void {
  for (const a of Array.from(el.querySelectorAll('a'))) {
    if (a.hasAttribute(FOLLOWED)) continue;
    const href = a.getAttribute('href') ?? '',
      data = a.getAttribute('data-href');
    const link = linkTo(data ?? href);
    if (link.kind !== 'refused' && linkKind(href) !== 'refused') {
      followAnchor(a, link, host, where);
      continue;
    }
    const text = createSpan({ cls: 'thoughtknot-link-refused', text: a.textContent ?? '' });
    a.parentElement?.insertBefore(text, a);
    a.remove();
  }
}

/** The links of graph `graph` in the note at `path`, followed through Obsidian. */
export function linkHost(plugin: ThoughtKnotPlugin, path: string, graph: string): Omit<LinkHost, 'broken'> {
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
      // what Obsidian renders is owned by a component of its own, unloaded when the layer's `owner` is
      const component = new Component();
      component.load();
      owner.register(() => component.unload());
      const draw = async (md: string, into: HTMLElement, from: string) => {
        // links Obsidian puts in later, as a post-processor may, are judged as they come, for as long as `owner` lasts
        const later = new MutationObserver(() => followRendered(into, { ...host, broken: [] }, where));
        later.observe(into, { childList: true, subtree: true });
        owner.register(() => later.disconnect());
        await MarkdownRenderer.render(plugin.app, md, into, from, component);
        followRendered(into, { ...host, broken: [] }, where);
      };
      // a note embedded is read here and rendered made safe, never handed to Obsidian to embed. So nothing it holds is
      // loaded, a remote image among it (offline_and_mobile_apis). A note it embeds in turn is a link
      const parts = embedParts(markdown);
      for (const part of parts) {
        if ('text' in part) {
          await draw(safeMarkdown(part.text), parts.length === 1 ? el : el.createDiv(), path);
          continue;
        }
        const box = el.createDiv({ cls: 'thoughtknot-embed' }),
          file = plugin.app.metadataCache.getFirstLinkpathDest(part.embed.target, path);
        // a heading embedded, `![[Note#Heading]]`, is that section alone
        const hash = part.embed.opens.indexOf('#'),
          heading = hash >= 0 ? part.embed.opens.slice(hash + 1) : undefined;
        if (file instanceof TFile && file.extension === 'md')
          await draw(embeddedMarkdown(await plugin.app.vault.cachedRead(file), heading), box, file.path);
        else await draw(safeMarkdown(`[[${part.embed.opens}]]`), box, path); // a note not there: a link to it
      }
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
export function vaultNames(plugin: ThoughtKnotPlugin): string[] {
  return plugin.app.vault.getFiles().map((f) => (f.extension === 'md' ? f.name.slice(0, -3) : f.name));
}
