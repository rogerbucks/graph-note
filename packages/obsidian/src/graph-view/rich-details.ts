// The rich parts of a box's or link's details (editor spec §18): a thing's text and properties rendered as Markdown by
// Obsidian's own MarkdownRenderer, so images, maths, links and embeds appear as in a note (rich_details), the plugin
// writing no HTML of its own; a thing whose id is a link to a note showing that note, rendered, with a link that opens
// it (node_is_a_note); and the links and attachments it holds (links-list.ts). What is rendered is owned by a component
// of its own, unloaded when the details are drawn again or close, so nothing rendered outlives what it was rendered for.
import { Component } from 'obsidian';
import { attachmentsOf, linksHeld, noteOf, withMeant } from '@graph-note/core';
import type { Target } from '@graph-note/core';
import { linkAnchor, renderLinks } from '../links/links-list';
import type { LeftAt } from '../links/link-host';
import type { ViewOptions } from './view-options';

/** A text that holds Markdown, so is worth Obsidian's renderer: any of its marks, a link's among them. */
const MARKED = /[[\]*_`$!<~=#>|^]/;

/** The rich parts of one card's details, rendered by Obsidian into the details as they are drawn. */
export class RichDetails {
  private owner: Component | null = null;

  /** For a card's options, and where the card is, for the back step when a link takes its tab. */
  constructor(
    private readonly o: ViewOptions,
    private readonly where: () => LeftAt | null,
  ) {}

  /** The details are drawn afresh: what was rendered for the last is unloaded, and a new owner started. */
  begin(): void {
    this.end();
    this.owner = new Component();
    this.owner.load();
  }

  /** The details close, or the card goes: what was rendered is unloaded. */
  end(): void {
    this.owner?.unload();
    this.owner = null;
  }

  /** `markdown` rendered by Obsidian into a new element of `parent`. */
  private render(parent: HTMLElement, markdown: string, cls: string): void {
    const host = this.o.links,
      el = parent.createDiv({ cls });
    if (!host || !this.owner) {
      el.setText(markdown);
      return;
    }
    void host.render(markdown, el, this.owner, this.where);
  }

  /**
   * What a thing stands for and says: the note its id links to, rendered, with a link that opens it (node_is_a_note);
   * then its text, rendered, when it holds Markdown.
   */
  thing(el: HTMLElement, key: string, text: string): void {
    const host = this.o.links,
      note = host && noteOf(this.o.reading, this.o.graph, key);
    if (host && note) {
      const box = el.createDiv({ cls: 'graph-note-note' });
      linkAnchor(box.createDiv(), note, host, this.where, `Open ${note.label}`);
      this.render(box, `![[${note.opens}]]`, 'graph-note-note-body');
    }
    if (host && MARKED.test(text)) this.render(el, text, 'graph-note-rich-text');
  }

  /** Properties to read, each `name:` and its value rendered by Obsidian (spec §3, §14). */
  properties(el: HTMLElement, properties: [string, string][]): void {
    el.createEl('h4', { text: 'Properties' });
    const ul = el.createEl('ul', { cls: 'graph-note-rich-properties' });
    for (const [k, v] of properties) {
      const li = ul.createEl('li');
      li.createSpan({ cls: 'graph-note-property-name', text: `${k}: ` });
      if (this.o.links) this.render(li, v, 'graph-note-rich-value');
      else li.appendText(v);
    }
  }

  /** The links a box or a link holds, and a thing's attachments, on the card and in the inspector alike. */
  links(el: HTMLElement, target: Target): void {
    const host = this.o.links;
    if (!host) return;
    const { reading, graph } = this.o;
    renderLinks(
      el,
      linksHeld(reading, graph, target),
      'thing' in target ? attachmentsOf(reading, graph, target.thing) : [],
      {
        host,
        texts: reading.texts,
        write: this.o.writeBlock,
        where: this.where,
        meant: (b, m) => withMeant(reading.texts[b.problem.block] ?? '', b, m),
        readOnly: () => !!this.o.readOnly?.(),
      },
    );
  }
}
