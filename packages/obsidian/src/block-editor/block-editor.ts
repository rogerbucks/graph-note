// The block editor as Obsidian owns it (spec §4, §9). The editor itself, the text field over its coloured picture, the
// problems with fixes, suggestions, the drawing beside it, undo, redo and Lock the graph, is the display layer's
// (`@thoughtknot/core/display/editor/block-editor`), the same one the browser editor's page runs; this wraps it in a
// component Obsidian owns, to load and unload with the pane or the plugin, over the vault's note (block-note.ts).
import { Component } from 'obsidian';
import type { NoteReading, PaneSession } from '@thoughtknot/core';
import { BlockEditor as SharedEditor } from '@thoughtknot/core/display/editor/block-editor';
import type { Layout } from '@thoughtknot/core/display/editor/editor-layout';
import type { Chosen, DeclaredDeferred } from '@thoughtknot/core/display/graph-view/view-options';
import type { DeclaredList } from '@thoughtknot/core/display/properties/list-row';
import type ThoughtknotPlugin from '../main';
import { BlockNote } from './block-note';

export type { Layout };

/** The text editor for one graph block (spec §4), in the pane or in place in the block's card, over the vault's note. */
export class BlockEditor extends Component {
  readonly layout: Layout;
  private readonly editor: SharedEditor;
  /** The lists made while the editor is open, which the inspector shows even before they hold a value. */
  lists?: DeclaredList[];

  constructor(plugin: ThoughtknotPlugin, layout: Layout) {
    super();
    this.layout = layout;
    this.editor = new SharedEditor(
      {
        settings: () => plugin.settings,
        layout: (drawing, by) => plugin.layout(drawing, by),
      },
      layout,
      new BlockNote(plugin),
    );
  }

  /** The path of the note being edited. */
  get path(): string {
    return this.editor.path;
  }

  /** The session on the block being edited, or null when there is none. */
  get session(): PaneSession | null {
    return this.editor.session;
  }

  /** Whether the editor is on the page, in a card or the pane. */
  get onPage(): boolean {
    return this.editor.onPage;
  }

  /** Called with what is typed, read, whenever it changes: the card in place redraws its drawing from it. */
  get onReading(): ((reading: NoteReading) => void) | undefined {
    return this.editor.onReading;
  }
  set onReading(f: ((reading: NoteReading) => void) | undefined) {
    this.editor.onReading = f;
  }

  /** Called when Done is pressed in place. */
  set onDone(f: (() => void) | undefined) {
    this.editor.onDone = f;
  }
  get onDone(): (() => void) | undefined {
    return this.editor.onDone;
  }

  /** What the card's details were open on, so its inspector reopens on it after each redraw. */
  get selected(): { key: string } | { link: number } | null {
    return this.editor.selected;
  }
  set selected(s: { key: string } | { link: number } | null) {
    this.editor.selected = s;
  }

  override onload(): void {
    this.editor.load();
  }

  override onunload(): void {
    this.editor.unload();
  }

  open(path: string, line: number): Promise<void> {
    return this.editor.open(path, line);
  }

  mount(container: HTMLElement): void {
    this.editor.mount(container);
  }

  flush(): Promise<void> {
    return this.editor.flush();
  }

  focus(): void {
    this.editor.focus();
  }

  /** Reads what the field now holds again, as after a setting changed. */
  changed(): void {
    this.editor.changed();
  }

  /** Park for later's fix: Deferred and DEFERS declared in the graph's schema, wherever it is written. */
  declareDeferred = (): Promise<DeclaredDeferred> => this.editor.declareDeferred();

  /** Replaces the whole text, as an edit made from the drawing; false with no field. */
  replace(text: string): boolean {
    return this.editor.replace(text);
  }

  /** A box, link or estimate chosen in the drawing, selected where it is written, the focus in the text (§4). */
  reveal(chosen: Chosen): void {
    this.editor.reveal(chosen);
  }

  /** Done, in place: writes what is left, then closes. */
  done(): Promise<void> {
    return this.editor.done();
  }

  /** Takes the editor off the page, as Done does in place. */
  detach(): void {
    this.editor.detach();
  }
}
