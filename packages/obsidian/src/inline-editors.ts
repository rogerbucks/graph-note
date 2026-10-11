// The editors open in place, in drawings' cards (spec §4, typing_keeps_focus): each known by its block's identity in the
// editing view, so a line added or taken away above the block never loses it, and never taken by another block that comes
// to sit on its line; one to a block, however often Edit here is pressed; and released, with what was typed written,
// once its card has left the page and its note is no longer open, so no editor nobody can see keeps listening to the vault.
import { Component, Notice } from 'obsidian';
import type GraphNotePlugin from './main';
import type { EditTarget } from './main';
import type { Editing } from './graph-view/view-options';
import { BlockEditor } from './block-editor/block-editor';
import { blocksIn } from './live-preview';

/** How long an editor whose card has left the page is waited for in another card before it is released. */
const RELEASE_AFTER_MS = 1000;

/** What is said when Edit here is pressed on a card whose note is no longer where the card was drawn from. */
const GONE_MESSAGE =
  'This note is not there any more: it was renamed, moved or deleted. Open it again to edit it here.';

/** Where an editor in place was opened: the note's path then, its block's fence line, its card's identity, its opening. */
interface Placed {
  path: string;
  line: number;
  card: number | undefined;
  opening?: Promise<void>;
}

/** The plugin's editors in place: found by their block, opened by Edit here, released when their card is gone. */
export class InlineEditors extends Component {
  private readonly plugin: GraphNotePlugin;
  private readonly open = new Map<BlockEditor, Placed>();
  /** Who to tell when an editor in place opens or closes: each card's edit button. */
  private readonly watchers = new Set<() => void>();
  private releaseTimer: number | null = null;

  constructor(plugin: GraphNotePlugin) {
    super();
    this.plugin = plugin;
  }

  override onunload(): void {
    // no timer outlives the plugin
    if (this.releaseTimer !== null) window.clearTimeout(this.releaseTimer);
    this.releaseTimer = null;
  }

  /** How many editors are open in place. */
  get size(): number {
    return this.open.size;
  }

  /** Tells `changed` each time an editor in place opens or closes; returns how to stop. */
  watch(changed: () => void): () => void {
    this.watchers.add(changed);
    return () => this.watchers.delete(changed);
  }

  private changed(): void {
    for (const changed of this.watchers) changed();
  }

  /**
   * The editor open in place on a note's block whose opening fence is on `line` now, if there is one. In the editing view
   * a block is known by its card's identity, which no line added or taken away above it changes. Once that identity is
   * gone, as when the block is cut, and elsewhere, it is found where the editor last found its block, or, still opening,
   * where it was opened; and only when the block there is the one it read, so another block never takes the editor.
   */
  find(path: string, line: number): BlockEditor | undefined {
    const cm = this.plugin.editorFor(path),
      blocks = cm ? blocksIn(cm.state) : [],
      block = blocks.find((b) => b.open === line),
      here = block?.id;
    for (const [e, at] of this.open) {
      // a card drawn before its note was renamed still knows it by the name it had, which no note now has
      if (e.path !== path && (at.path !== path || this.plugin.app.vault.getFileByPath(path))) continue;
      if (blocks.some((b) => b.id === at.card)) {
        if (at.card === here) return e;
        continue;
      }
      // the block on the line is the editor's own only when its text is the one the editor last read or wrote there: the
      // same graph is not enough, as a graph written over several blocks has another block of it come to the line
      const same = !block || !e.session || block.text === e.session.ref.text;
      if ((e.session?.ref.line ?? at.line) === line && same) {
        at.card = here;
        return e;
      }
    }
    return undefined;
  }

  /**
   * Edit here: opens the block's text in place, inside its drawing's card (spec §4), with the focus in it. Pressed again,
   * even before the first press has opened it, it moves the editor already open into the card and focuses it.
   */
  async editHere(target: EditTarget, slot: HTMLElement): Promise<void> {
    let editor = this.find(target.path, target.line);
    if (!editor) {
      const e = new BlockEditor(this.plugin, 'inline');
      // a setting that changes how the text is read or drawn: read again at once (spec §21)
      e.register(this.plugin.watchSettings(() => e.changed()));
      e.onDone = () => {
        this.open.delete(e);
        e.detach();
        this.plugin.removeChild(e);
        this.changed();
      };
      const at: Placed = { path: target.path, line: target.line, card: this.cardAt(target.path, target.line) };
      this.open.set(e, at);
      this.plugin.addChild(e);
      e.mount(slot);
      // an opening that fails, as when the note cannot be read, settles all the same, so a later press never waits on it
      const failed = { why: '' };
      at.opening = e.open(target.path, target.line).catch((err: unknown) => {
        failed.why = err instanceof Error ? err.message : String(err);
      });
      await at.opening;
      if (!e.session) {
        // nothing to edit: the note could not be read, is not there any more, or has no graph block, as the card then
        // says; never kept
        if (failed.why) new Notice(`This note could not be read, so it cannot be edited here: ${failed.why}.`);
        else if (!e.path) new Notice(GONE_MESSAGE);
        e.onDone?.();
        return;
      }
      // the lists made in this session outlive this editor: Done, then Edit here again, still offers them
      (e as Editing).lists = this.plugin.declaredLists(target.path, e.session.graph);
      editor = e;
      this.changed();
    } else {
      // pressed again while it opens: it is moved only once it has opened, so the card never shows it half made
      await this.open.get(editor)?.opening;
      if (!this.open.has(editor)) return;
      editor.mount(slot);
    }
    editor.focus();
  }

  /** The identity of the card for the block whose fence is on `line` in the note open in the editing view, if it is. */
  private cardAt(path: string, line: number): number | undefined {
    const cm = this.plugin.editorFor(path);
    return cm ? blocksIn(cm.state).find((b) => b.open === line)?.id : undefined;
  }

  /**
   * A card has left the page, or an editing view has closed, which takes down only the cards drawn at the time: an
   * editor in place that a moment later is neither on the page nor on a note still open in the editing view, where a
   * card drawn again would take it back, is closed as Done closes it, what was typed written first. A card scrolled
   * away, or a block cut to be pasted, keeps its editor while its note is open.
   */
  releaseUnseen(): void {
    if (!this.open.size) return;
    if (this.releaseTimer !== null) window.clearTimeout(this.releaseTimer);
    this.releaseTimer = window.setTimeout(() => {
      this.releaseTimer = null;
      for (const e of [...this.open.keys()])
        if (e.session && !e.onPage && !this.plugin.editorFor(e.path)) void e.done();
    }, RELEASE_AFTER_MS);
  }
}
