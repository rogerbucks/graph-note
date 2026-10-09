// The block editor (spec §4, §9): the text of one graph block, with everything that helps write it — a plain text field
// over a coloured picture of it, problems marked with their fixes on the caret's line, suggestions, each line read back, the
// comma added for you — and the safe writing behind it: what is typed is written through the core's session, which never
// overwrites a block changed meanwhile and keeps what was typed as a draft; undo, redo and Lock the graph. Shared by the
// edit pane and by the editor in place inside a drawing's card. This module ties together the parts in its folder.
import { Component, TFile } from 'obsidian';
import type { App } from 'obsidian';
import { isDraft } from '@graph-note/core';
import type { Change, CompletionItem, NoteReading, PaneSession } from '@graph-note/core';
import type GraphNotePlugin from '../main';
import { buildEditor, showTools } from './editor-layout';
import type { EditorParts, Layout } from './editor-layout';
import { withFix } from './problem-help';
import type { FixChanges } from './problem-help';
import { TextHelp } from './text-help';
import { KeptField } from './kept-field';
import { addForYouInField, stepOverInField } from './added-for-you';
import { FieldHistory } from './editor-history';
import type { Step } from './editor-history';
import { BlockNote } from './block-note';
import type { Refused } from './note-writing';
import { reloadedMessage, showDraft } from './kept-draft';
import { PaneDrawing } from './pane-drawing';
import { fieldTyping, watchKeys, watchTyping } from './typing-keys';

export type { Layout } from './editor-layout';

/** How long typing rests before it is written: in the pane well inside the spec's third of a second; in place longer. */
const WRITE_AFTER_MS: Record<Layout, number> = { pane: 150, inline: 700 };
const DRAW_AFTER_MS = 250;

/** The text editor for one graph block (spec §4), in the pane or in place in the block's card: colours, fixes, suggestions, read-back, and writing back to the note. */
export class BlockEditor extends Component {
  readonly layout: Layout;
  private readonly plugin: GraphNotePlugin;
  private readonly app: App;
  private container: HTMLElement | null = null;
  /** The note being edited, and the session on its block. */
  private readonly note: BlockNote;
  /** What is typed, read, and the help shown from it. */
  private readonly help = new TextHelp({ fix: (changes) => this.apply(changes), accept: (item) => this.accept(item) });
  private writeTimer: number | null = null;
  /** The field's focus and scroll, kept through each move and redraw. */
  private readonly field: KeptField;
  /** The text's own undo history, which, unlike the field's, survives the field leaving the page (spec §4). */
  private readonly undoes = new FieldHistory();
  private drawTimer: number | null = null;
  /** The pane's drawing; in place, the card's own drawing is the drawing. */
  private readonly drawing: PaneDrawing;
  private el: EditorParts | null = null;
  /** Called with what is typed, read, whenever it changes: the card in place redraws its drawing from it. */
  onReading?: (reading: NoteReading) => void;
  /** Called when Done is pressed in place. */
  onDone?: () => void;

  constructor(plugin: GraphNotePlugin, layout: Layout) {
    super();
    this.plugin = plugin;
    this.app = plugin.app;
    this.layout = layout;
    this.note = new BlockNote(plugin);
    this.field = this.addChild(new KeptField(() => this.el?.text));
    this.drawing = this.addChild(new PaneDrawing(plugin));
  }

  /** The path of the note being edited. */
  get path(): string {
    return this.note.path;
  }

  /** The session on the block being edited, or null when there is none. */
  get session(): PaneSession | null {
    return this.note.session;
  }

  override onload(): void {
    this.registerEvent(
      this.app.vault.on('modify', (f) => {
        if (f instanceof TFile) void this.onModify(f);
      }),
    );
  }

  override onunload(): void {
    // no timer outlives the editor: what was waiting to be written is written now, and the redraw is not needed
    if (this.writeTimer !== null) window.clearTimeout(this.writeTimer);
    if (this.drawTimer !== null) window.clearTimeout(this.drawTimer);
    this.writeTimer = this.drawTimer = null;
    if (this.session?.dirty) void this.write();
  }

  /** Opens a block of a note: the one whose fence is on `line` (0-based), or the note's first graph block. */
  async open(path: string, line: number): Promise<void> {
    if (this.session?.dirty) await this.write();
    if ((await this.note.open(path, line)) && this.container) this.render();
  }

  /** Shows the editor in a container: built the first time; moved, with its text, caret and focus, after that. */
  mount(container: HTMLElement): void {
    const root = this.el?.root;
    if (root && this.container) {
      this.field.move(root, container, this.el?.text, this.el?.overlay);
      this.container = container;
      return;
    }
    this.container = container;
    this.render();
  }

  async flush(): Promise<void> {
    if (this.writeTimer !== null) {
      window.clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    await this.write();
  }

  focus(): void {
    this.el?.text.focus({ preventScroll: true });
    if (this.el) this.field.typedIn();
  }

  /** What the card's details were open on, so its inspector reopens on it after each redraw. */
  selected: { key: string } | { link: number } | null = null;

  /** Replaces the whole text, as an edit made from the inspector: shown, checked and written like typing. */
  replace(text: string): void {
    const t = this.el?.text;
    if (!t) return;
    t.value = text;
    this.typedAgain();
  }

  /**
   * A box or a link chosen in the drawing: its pattern selected where it is written in the text being edited, with the
   * focus in the text so the selection shows (select_moves_text, spec §4).
   */
  reveal(chosen: { thing: string } | { link: number }): void {
    const el = this.el,
      s = this.session,
      where = el && s ? this.help.whereIs(chosen, el.text.value, s.graph) : null;
    if (!el || !where) return;
    el.text.focus({ preventScroll: true });
    el.text.setSelectionRange(where.from, where.to);
    this.caretMoved();
  }

  /** Done, in place: writes what is left, then closes. */
  async done(): Promise<void> {
    await this.flush();
    this.onDone?.();
  }

  /** Takes the editor off the page, as Done does in place. */
  detach(): void {
    this.field.leave();
    this.el?.root.remove();
    this.el = null;
    this.container = null;
  }

  private render(): void {
    const container = this.container;
    if (!container) return;
    container.empty();
    this.el = null;
    this.drawing.clear();
    const s = this.session;
    if (!s) {
      if (this.path) container.createEl('p', { text: 'This note has no graph block to edit.' });
      return;
    }
    const el = buildEditor(container, s, this.layout, {
      choose: (line) => void this.choose(line),
      showDrawing: () => this.redraw(),
    });
    this.undoes.start(s.text);
    this.el = el;
    const typing = fieldTyping(el, s, this.help, this.undoes, {
      typed: (change) => this.typed(change),
      caretMoved: () => this.caretMoved(),
      accept: (item) => this.accept(item),
      changed: () => this.changed(),
    });
    watchTyping(this, el.text, typing);
    this.field.watch(el.text, el.overlay);
    watchKeys(this, el.text, typing);

    this.analyse();
    this.help.hearAll();
    this.paint();
    this.redraw();
    this.showTools();
    this.showKeptDraft();
  }

  private showTools(): void {
    const el = this.el,
      s = this.session;
    if (!el || !s) return;
    showTools(el.tools, {
      inline: this.layout === 'inline',
      draft: !!this.help.reading && isDraft(this.help.reading, s.graph),
      done: () => void this.done(),
      undo: () => void this.history('undo'),
      redo: () => void this.history('redo'),
      lock: () => void this.lock(),
    });
  }

  private typed(change: Change = 'typing'): void {
    const el = this.el,
      s = this.session;
    if (!el || !s) return;
    const stepped = stepOverInField(el.text, s.text); // before the record: undo goes back to text that was on screen
    this.undoes.record(el.text, change);
    // what is added for you is a step of its own, so the very next undo takes back only it (spec §4)
    if (addForYouInField(el.text, s.text, this.note.text, s.ref.line, stepped)) this.undoes.record(el.text, 'other');
    s.type(el.text.value);
    this.analyse();
    this.help.announce(el); // new problems said to screen readers, the focus left where it is
    this.paint();
    this.schedule();
  }

  /** A change made for the person, such as one from the inspector: recorded as a step, analysed and written. */
  private typedAgain(): void {
    this.undoes.record(this.el?.text, 'other');
    this.changed();
  }

  /** What the field now holds, analysed and written, without asking for another comma or colon. */
  private changed(): void {
    const el = this.el,
      s = this.session;
    if (!el || !s) return;
    s.type(el.text.value);
    this.analyse();
    this.help.announce(el); // new problems said to screen readers, the focus left where it is
    this.paint();
    this.schedule();
  }

  private caretMoved(): void {
    if (this.el) this.help.caretMoved(this.el, this.session);
  }

  private schedule(): void {
    const w = window;
    if (this.writeTimer !== null) w.clearTimeout(this.writeTimer);
    this.writeTimer = w.setTimeout(() => {
      this.writeTimer = null;
      void this.write();
    }, WRITE_AFTER_MS[this.layout]);
    if (this.drawTimer !== null) w.clearTimeout(this.drawTimer);
    this.drawTimer = w.setTimeout(() => {
      this.drawTimer = null;
      this.redraw();
    }, DRAW_AFTER_MS);
  }

  /** Reads what is typed: the problems, and the reading the suggestions and the read-back come from. */
  private analyse(): void {
    const s = this.session;
    if (!s) return;
    const reading = this.help.read(s, this.note.text);
    this.onReading?.(reading);
    this.help.check(s, this.note.text, this.path);
  }

  /** The coloured picture of the text, the problems list, and the bars of fixes and suggestions where the caret is. */
  private paint(): void {
    if (this.el && this.session) this.help.paint(this.el, this.session);
  }

  private apply(changes: FixChanges): void {
    const el = this.el;
    if (!el) return;
    el.text.value = withFix(el.text.value, changes);
    el.text.focus({ preventScroll: true });
    this.typed('other');
  }

  private accept(item: CompletionItem): void {
    const el = this.el;
    if (!el) return;
    this.help.accept(el.text, item);
    this.typed('other');
  }

  private redraw(): void {
    const el = this.el,
      s = this.session,
      host = el?.drawing,
      reading = this.help.reading;
    if (!el || !host || !s || !reading || host.hidden) return;
    this.drawing.redraw(host, reading, s, () => !this.el || this.el !== el, {
      edit: () => el.text.focus({ preventScroll: true }),
      select: (chosen) => this.reveal(chosen),
    });
  }

  private async choose(line: number): Promise<void> {
    if (this.session?.dirty) await this.write();
    this.session?.select(line);
    this.render();
  }

  /** Writes what is typed into the note; a refused write reloads the block and keeps what was typed as a draft. */
  private async write(): Promise<void> {
    const refused = await this.note.write();
    if (refused) await this.keepDraft(refused);
  }

  private async keepDraft({ reason, draft }: Refused): Promise<void> {
    await this.note.keepDraft(draft);
    if (this.el && this.session) this.el.text.value = this.session.text;
    this.reloaded();
    this.showKeptDraft(reloadedMessage(reason));
  }

  /** The text as the note now has it, shown with its history started again, its help and its drawing. */
  private reloaded(): void {
    this.undoes.reset(this.el?.text);
    this.analyse();
    this.paint();
    this.redraw();
  }

  private showKeptDraft(message?: string): void {
    const el = this.el;
    if (!el) return;
    showDraft(el.draft, this.note.draft(), message, {
      restore: (text) => {
        el.text.value = text;
        void this.forget();
        this.typed('other');
      },
      discard: () => void this.forget(),
    });
  }

  private async forget(): Promise<void> {
    if (this.el) this.el.draft.hidden = true;
    await this.note.forget();
  }

  private async onModify(f: TFile): Promise<void> {
    const outcome = await this.note.reread(f);
    if (outcome === null) return;
    if (outcome === 'reloaded' && this.el) {
      this.el.text.value = this.session?.text ?? '';
      this.reloaded();
      this.showTools();
    } else if (outcome === 'conflict') await this.write();
    else {
      this.analyse();
      this.paint();
      this.showTools();
    }
  }

  private async history(which: Step): Promise<void> {
    const s = this.session;
    if (!s || !this.note.file()) return;
    if (this.writeTimer !== null) {
      window.clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    const refused = await this.note.step(which);
    if (refused) {
      await this.keepDraft(refused);
      return;
    }
    if (this.el) this.el.text.value = s.text;
    this.reloaded();
  }

  /** Lock the graph: writes its schema as a new block after the graph's last block in the note (spec §8). */
  private async lock(): Promise<void> {
    const s = this.session;
    if (!s || !this.note.file() || !this.help.reading) return;
    if (s.dirty) await this.write();
    await this.note.lock();
    this.analyse();
    this.paint();
    this.showTools();
  }
}
