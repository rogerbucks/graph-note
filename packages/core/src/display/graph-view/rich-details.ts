// The rich parts of a box's or link's details (editor spec §18): a thing's text and properties rendered as Markdown by
// Obsidian's own MarkdownRenderer, so images, maths, links and embeds appear as in a note (rich_details), the plugin
// writing no HTML of its own; a thing whose id is a global note id or a link to a note showing that note, read and
// rendered made safe, with a link that opens it (node_is_a_note); and the links and attachments it holds
// (links-list.ts). What is rendered is owned by a component
// of its own, unloaded when the details are drawn again or close, so nothing rendered outlives what it was rendered for.
import { Lifecycle } from '../lifecycle';
import { attachmentsOf, linksHeld, noteOf, withMeant, word } from '@thoughtknot/core';
import type { Target, View } from '@thoughtknot/core';
import { noteControls } from './note-controls';
import { linkAnchor, renderLinks } from '../links/links-list';
import type { LeftAt } from '../links/link-types';
import type { ViewOptions } from './view-options';

/** A text that holds Markdown, so is worth Obsidian's renderer: any of its marks, a link's among them. */
const MARKED = /[[\]*_`$!<~=#>|^]/;

/** The rich parts of one card's details, rendered by Obsidian into the details as they are drawn. */
export class RichDetails {
  private owner: Lifecycle | null = null;

  /** Where the card is: its zoom, where it is panned and the thing selected, kept when a link takes its tab. */
  private readonly where: () => LeftAt | null;

  /** For a card's options, its drawing's view as it is now, and the thing selected (back_where_you_were). */
  constructor(
    private readonly o: ViewOptions,
    view: () => View | undefined,
    selectedKey: () => string | null,
  ) {
    this.where = () => {
      const v = view(),
        selected = selectedKey();
      return v ? { zoom: v.scale, x: v.x, y: v.y, ...(selected ? { selected } : {}) } : null;
    };
  }

  /** The details are drawn afresh: what was rendered for the last is unloaded, and a new owner started. */
  begin(): void {
    this.end();
    this.owner = new Lifecycle();
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
      const box = el.createDiv({ cls: 'thoughtknot-note' });
      linkAnchor(box.createDiv(), note, host, this.where, `Open ${note.label}`);
      this.render(box, `![[${note.opens}]]`, 'thoughtknot-note-body');
    }
    if (host && MARKED.test(text)) this.render(el, text, 'thoughtknot-rich-text');
    this.note(el, { thing: key }); // its note (§24, note_shown)
  }

  /**
   * A thing's or link's note (editor spec §24, note_shown), under a heading of its own: its whole text rendered as
   * Markdown by the same renderer as the rest of the details, which writes no HTML of its own and is handed none to
   * render. Nothing when it has no note.
   */
  private note(el: HTMLElement, target: { thing: string } | { link: number }): void {
    const drawing = this.o.reading.graphs.get(this.o.graph),
      note =
        'thing' in target
          ? drawing?.boxes.find((b) => b.key === target.thing)?.note
          : drawing?.links[target.link]?.note;
    if (!note) return;
    el.createEl('h4', { text: 'Note' });
    this.render(el, note.text, 'thoughtknot-thing-note');
  }

  /** The note controls of a thing or link while its block is edited (note_add); `replace` writes the block. */
  noteControls(
    el: HTMLElement,
    target: { thing: string } | { link: number },
    text: () => string,
    replace: (text: string) => void,
  ): void {
    noteControls(el, this.o.reading, this.o.graph, target, text, replace);
  }

  /** Properties to read, as a table of each name and its value rendered by Obsidian (spec §3, §14, details_properties_table). */
  properties(el: HTMLElement, properties: [string, string][]): void {
    el.createEl('h4', { cls: 'thoughtknot-section-label', text: word('details.properties') });
    const dl = el.createEl('dl', { cls: 'thoughtknot-rich-properties' });
    for (const [k, v] of properties) {
      dl.createEl('dt', { cls: 'thoughtknot-property-name', text: k });
      const dd = dl.createEl('dd');
      if (this.o.links) this.render(dd, v, 'thoughtknot-rich-value');
      else dd.appendText(v);
    }
  }

  /** The links a box or a link holds, and a thing's attachments, on the card and in the inspector alike. */
  links(el: HTMLElement, target: Target): void {
    if ('link' in target) this.note(el, target); // a link's note (§24, note_shown)
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
