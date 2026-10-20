// The block editor (spec §4, §9): one graph block's text, with all that helps write it. That is a plain text field over
// a coloured picture of it, problems with fixes, suggestions, each line read back, the comma added for you. Behind it
// are safe writing (the core's session never overwrites a block changed meanwhile), undo, redo and Lock the graph.
import { indentText, isDraft, word } from '@thoughtknot/core';
import type { Change, CompletionItem, NoteReading, PaneSession } from '@thoughtknot/core';
import { Lifecycle } from '../lifecycle';
import { buildEditor, sayRefused, showTools, toolsSaid } from './editor-layout';
import type { EditorParts, Layout } from './editor-layout';
import { withFix } from './problem-help';
import type { FixChanges } from './problem-help';
import { TextHelp } from './text-help';
import { KeptField } from './kept-field';
import { addForYouInField, stepOverInField } from './added-for-you';
import { FieldHistory } from './editor-history';
import type { Step } from './editor-history';
import type { EditorNote, Refused, Reread } from './editor-note';
import { BlockPicker } from './block-picker';
import { keptMessage, offerDraft } from './kept-draft';
import { PaneDrawing } from './pane-drawing';
import type { PaneHost } from './pane-drawing';
import { fieldTyping, watchKeys, watchTyping } from './typing-keys';
import { TypingRests } from './typing-rests';

export type { Layout } from './editor-layout';

/** The text editor for one graph block (spec §4), in the pane or in place in the block's card. It has colours, fixes, suggestions, read-back, and writing back to the note. */
export class BlockEditor extends Lifecycle {
  readonly layout: Layout;
  private readonly host: PaneHost;
  private container: HTMLElement | null = null;
  /** The note being edited, and the session on its block. */
  private readonly note: EditorNote;
  /** What is typed, read, and the help shown from it. */
  private readonly help = new TextHelp({ fix: (changes) => this.apply(changes), accept: (item) => this.accept(item) });
  /** The write as typing rests, and the redraw. */
  private readonly rests: TypingRests;
  /** The field's focus and scroll, kept through each move and redraw. */
  private readonly field: KeptField;
  /** The text's own undo history, which, unlike the field's, survives the field leaving the page (spec §4). */
  private readonly undoes = new FieldHistory();
  /** The pane's drawing; in place, the card's own drawing is the drawing. */
  private readonly drawing: PaneDrawing;
  private el: EditorParts | null = null;
  /** The pane's block picker, built again whenever the tools are shown, and a block chosen opened from the note as it is. */
  private readonly picker = new BlockPicker({
    session: () => this.session,
    write: () => this.write(),
    opened: () => this.render(),
  });
  /** Called with what is typed, read, whenever it changes: the card in place redraws its drawing from it. */
  onReading?: (reading: NoteReading) => void;
  /** Called when Done is pressed in place. */
  onDone?: () => void;

  /** An editor for `note`, in a host that settles the settings and lays graphs out (`host`), in the pane or in place. */
  constructor(host: PaneHost, layout: Layout, note: EditorNote) {
    super();
    this.host = host;
    this.layout = layout;
    this.note = note;
    this.rests = this.addChild(
      new TypingRests(layout, { write: () => void this.write(true), draw: () => this.redraw() }),
    );
    this.field = this.addChild(new KeptField(() => this.el?.text));
    this.drawing = this.addChild(new PaneDrawing(host));
  }

  /** The path of the note being edited. */
  get path(): string {
    return this.note.path;
  }

  /** The session on the block being edited, or null when there is none. */
  get session(): PaneSession | null {
    return this.note.session;
  }

  /** Whether the editor is on the page, in a card or the pane. */
  get onPage(): boolean {
    return !!this.el?.root.isConnected;
  }

  override onload(): void {
    this.register(this.note.watch({ changed: (outcome) => this.onModify(outcome), deleted: () => void this.write() }));
  }

  override onunload(): void {
    // no timer outlives the editor (its waits go with it, typing-rests.ts): what was waiting to be written is written now
    this.rests.noWrite();
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
    this.rests.noWrite();
    await this.write();
  }

  focus(): void {
    this.el?.text.focus({ preventScroll: true });
    if (this.el) this.field.typedIn();
  }

  /** What the card's details were open on, so its inspector reopens on it after each redraw. */
  selected: { key: string } | { link: number } | null = null;
  /** Park for later's fix: Deferred and DEFERS declared in the graph's schema, wherever it is written. */
  declareDeferred = () => this.note.declareDeferred(indentText(this.host.settings().indent));

  /**
   * Replaces the whole text, as an edit made from the drawing. It is a step of its own, shown, checked and written like
   * typing. The names it newly writes are checked again against the note as it is written (§4). False with no field.
   */
  replace(text: string): boolean {
    const t = this.el?.text;
    if (!t) return false;
    this.session?.edit(text);
    t.value = text;
    this.undoes.record(t, 'other');
    this.changed();
    return true;
  }

  /** A box, link or estimate chosen in the drawing, selected where it is written, the focus in the text (§4). */
  reveal(chosen: Parameters<TextHelp['whereIs']>[0]): void {
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
      if (this.path) container.createEl('p', { text: word('pane.no-block') });
      return;
    }
    const el = buildEditor(container, s, this.layout, { showDrawing: () => this.redraw() });
    this.undoes.start(s.text);
    this.el = el;
    this.picker.place(this.layout === 'pane' ? el.head : null);
    const typing = fieldTyping(el, s, this.help, this.undoes, {
      typed: (change) => this.typed(change),
      caretMoved: () => this.caretMoved(),
      openList: (open) => this.help.openList(el, this.session, open),
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

  /** What the tools last said of Undo and Redo, so typing draws them again only when that changes (§9). */
  private toolsShown = '';

  private showTools(onlyIfChanged = false): void {
    const el = this.el,
      s = this.session;
    if (!el || !s) return;
    const why = { undo: s.stepRefusal('undo'), redo: s.stepRefusal('redo') };
    if (onlyIfChanged && toolsSaid(why) === this.toolsShown) return;
    this.toolsShown = toolsSaid(why);
    this.picker.show(); // the note may have changed since: its blocks' lines with it
    showTools(el.tools, {
      inline: this.layout === 'inline',
      draft: !!this.help.reading && isDraft(this.help.reading, s.graph),
      why,
      done: () => void this.done(),
      undo: () => void this.history('undo'),
      redo: () => void this.history('redo'),
      lock: () => void this.lock(),
      again: s.stopped ? () => void this.picker.again() : null,
    });
  }

  private typed(change: Change = 'typing'): void {
    const el = this.el,
      s = this.session;
    if (!el || !s) return;
    // a word typed opens the suggestions; one taken, a fix or a draft put back closes them
    this.help.openList(el, null, change === 'typing');
    const stepped = stepOverInField(el.text, s.text); // before the record: undo goes back to text that was on screen
    this.undoes.record(el.text, change);
    // what is added for you is a step of its own, so the very next undo takes back only it (spec §4)
    if (addForYouInField(el.text, s.text, this.note.text, s.ref.line, stepped)) this.undoes.record(el.text, 'other');
    s.type(el.text.value);
    this.showTools(true); // typing after a reload makes Undo available again
    this.analyse();
    this.help.announce(el); // new problems said to screen readers, the focus left where it is
    this.paint();
    this.rests.typed();
  }

  /** What the field now holds, analysed and written, without asking for another comma or colon; as after a setting changed. */
  changed(): void {
    const el = this.el,
      s = this.session;
    if (!el || !s) return;
    s.type(el.text.value);
    this.showTools(true);
    this.analyse();
    this.help.announce(el); // new problems said to screen readers, the focus left where it is
    this.paint();
    this.rests.typed();
  }

  private caretMoved(): void {
    if (this.el) this.help.caretMoved(this.el, this.session);
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
      replace: (now) => this.replace(now),
    });
  }

  /** Writes what is typed into the note (held while typing rests, `BlockNote.write`); a refusal keeps it as a draft. */
  private async write(hold = false): Promise<void> {
    const refused = await this.note.write(hold);
    if (refused) await this.keepDraft(refused);
    else this.showTools(); // a write of its own is the editor's to undo, whatever changed outside before it
  }

  private async keepDraft({ reason, draft, edit, stopped }: Refused): Promise<void> {
    await this.note.keepDraft(draft);
    // a deleted note has no block to reload: the text stays as typed, with its caret and its history
    if (this.note.exists()) {
      if (this.el && this.session) this.el.text.value = this.session.text;
      this.reloaded();
    }
    // an edit the note refused (§4) is kept as this editor's own draft, by its id, and the banner offers that draft
    this.showKeptDraft(keptMessage(reason, this.note.deletedMessage, edit, stopped));
  }

  /** The text as the note now has it, shown with its history started again, its help, its drawing and its tools. */
  private reloaded(): void {
    this.undoes.reset(this.el?.text);
    this.analyse();
    this.paint();
    this.redraw();
    this.showTools();
  }

  /** The draft banner: Restore and Discard act on the very draft it shows, by its id (kept-draft.ts). */
  private showKeptDraft(message?: string): void {
    if (this.el) offerDraft(this.el, this.note, message, () => this.typed('other'));
  }

  private onModify(outcome: Reread): void {
    if (outcome === 'reloaded' && this.el) {
      this.el.text.value = this.session?.text ?? '';
      this.reloaded();
    } else if (outcome === 'conflict') void this.write(true);
    else {
      this.analyse();
      this.paint();
      this.showTools();
    }
  }

  private async history(which: Step): Promise<void> {
    const s = this.session;
    if (!s || !this.note.exists()) return;
    this.rests.noWrite();
    const refused = await this.note.step(which);
    if (refused?.history) {
      if (this.el) sayRefused(this.el.announce, refused.reason); // nothing typed, so nothing kept as a draft (§9)
      return this.showTools();
    }
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
    if (!s || !this.note.exists() || !this.help.reading) return;
    if (s.dirty) await this.write();
    await this.note.lock();
    this.analyse();
    this.paint();
    this.showTools();
  }
}
