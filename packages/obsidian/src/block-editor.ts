// The block editor (spec §4, §9): the text of one graph block, with everything that helps write it — a plain text field
// over a coloured picture of it, problems marked with their fixes on the caret's line, suggestions, each line read back, the
// comma added for you — and the safe writing behind it: what is typed is written through the core's session, which never
// overwrites a block changed meanwhile and keeps what was typed as a draft; undo, redo and Lock the graph. Shared by the
// edit pane and by the editor in place inside a drawing's card.
import { Component, Notice, Platform, TFile, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import {
  PaneSession,
  TextHistory,
  colonFor,
  commaFor,
  namesSharedSchema,
  completions,
  diagnostics,
  draw,
  gqlSpans,
  graphOfBlock,
  insertBlockAfter,
  isDraft,
  lockBlock,
  readBack,
  tokenize,
} from '@graph-note/core';
import type { Change, CompletionItem, Diagnostic, NoteReading, TextState } from '@graph-note/core';
import type GraphNotePlugin from './main';
import { GraphView } from './view';

/** Where the editor sits: in the edit pane, with its own drawing, a picker and, on a phone, tabs; or in place, in a drawing's card. */
export type Layout = 'pane' | 'inline';

/**
 * How long typing rests before it is written. In the pane, well inside the third of a second the spec asks for; in place a
 * little longer, since each write redraws the block the editor sits in.
 */
const WRITE_AFTER_MS: Record<Layout, number> = { pane: 150, inline: 700 };
const DRAW_AFTER_MS = 250;
/** How long a field taken off the page, while typed in, is waited for to come back: a safety stop, not the rule. */
const REFOCUS_FOR_MS = 30_000;

let ids = 0;
/** An id no other editor on the page uses, for a label its field points at. */
const nextId = (): string => `graph-note-text-${++ids}`;

function button(
  parent: HTMLElement,
  label: string,
  icon: string | null,
  onClick: () => void,
  text?: string,
): HTMLButtonElement {
  const b = parent.createEl('button', { attr: { 'aria-label': label, type: 'button' } });
  if (icon) setIcon(b, icon);
  if (text) b.createSpan({ text });
  b.addEventListener('click', onClick);
  return b;
}

/** The text editor for one graph block (spec §4), in the pane or in place in the block's card: colours, fixes, suggestions, read-back, and writing back to the note. */
export class BlockEditor extends Component {
  readonly layout: Layout;
  private readonly plugin: GraphNotePlugin;
  private readonly app: App;
  private container: HTMLElement | null = null;
  path = '';
  private note = '';
  session: PaneSession | null = null;
  private reading: NoteReading | null = null;
  private problems: Diagnostic[] = [];
  private suggestions: { from: number; items: CompletionItem[] } = { from: 0, items: [] };
  private writeTimer: number | null = null;
  /**
   * Whether the field is being typed in, and where it was scrolled to. Kept here, not read from the page, because
   * Obsidian takes the old card off the page before the new one asks for the editor: by then the field has lost both.
   */
  private kept = { focused: false, top: 0, left: 0 };
  private refocusTimer: number | null = null;
  /** The text's own undo history, which, unlike the field's, survives the field leaving the page (spec §4). */
  private undoes: TextHistory | null = null;
  private drawTimer: number | null = null;
  private drawing: GraphView | null = null;
  private el: {
    root: HTMLElement;
    text: HTMLTextAreaElement;
    overlay: HTMLElement;
    fixbar: HTMLElement;
    suggest: HTMLElement;
    list: HTMLElement;
    draft: HTMLElement;
    drawing: HTMLElement | null;
    tools: HTMLElement;
    announce: HTMLElement;
  } | null = null;
  /** The problems already announced, so only new ones are (spec §8). */
  private heard = new Set<string>();
  /** Called with what is typed, read, whenever it changes: the card in place redraws its drawing from it. */
  onReading?: (reading: NoteReading) => void;
  /** Called when Done is pressed in place. */
  onDone?: () => void;

  constructor(plugin: GraphNotePlugin, layout: Layout) {
    super();
    this.plugin = plugin;
    this.app = plugin.app;
    this.layout = layout;
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
    if (this.refocusTimer !== null) window.clearTimeout(this.refocusTimer);
    this.writeTimer = this.drawTimer = this.refocusTimer = null;
    if (this.session?.dirty) void this.write();
  }

  /** Opens a block of a note: the one whose fence is on `line` (0-based), or the note's first graph block. */
  async open(path: string, line: number): Promise<void> {
    if (this.session?.dirty) await this.write();
    const file = this.file(path);
    if (!file) return;
    this.path = path;
    this.note = await this.app.vault.read(file);
    try {
      this.session = new PaneSession(this.note, line);
    } catch (e) {
      this.session = null;
      new Notice(String((e as Error).message));
    }
    if (this.session && gqlSpans(this.note).some((x) => namesSharedSchema(x.text)))
      this.session.shared = await this.plugin.sharedSchemas();
    if (this.container) this.render();
  }

  /** Shows the editor in a container: built the first time; moved, with its text, caret and focus, after that. */
  mount(container: HTMLElement): void {
    const root = this.el?.root;
    if (root && this.container) {
      const t = this.el?.text,
        overlay = this.el?.overlay,
        focused = this.kept.focused || (t && activeDocument.activeElement === t),
        a = t?.selectionStart ?? 0,
        b = t?.selectionEnd ?? 0;
      container.appendChild(root);
      this.container = container;
      if (!t) return;
      t.scrollTop = this.kept.top;
      t.scrollLeft = this.kept.left;
      if (overlay) {
        overlay.scrollTop = this.kept.top;
        overlay.scrollLeft = this.kept.left;
      }
      if (focused) this.refocus(t, a, b);
      return;
    }
    this.container = container;
    this.render();
  }

  /**
   * Gives the field back its focus and selection. In Live Preview Obsidian draws a block into a card that goes on the page
   * only after, and nothing off the page can take the focus: so it waits for the field to be on the page, a couple of
   * seconds at most, and gives it back only if nothing else has taken the focus meanwhile.
   */
  private refocus(t: HTMLTextAreaElement, a: number, b: number): void {
    if (this.refocusTimer !== null) window.clearTimeout(this.refocusTimer);
    this.refocusTimer = null;
    const started = Date.now();
    const attempt = () => {
      this.refocusTimer = null;
      if (!this.kept.focused || this.el?.text !== t) return;
      if (t.isConnected) {
        const doc = t.ownerDocument,
          now = doc.activeElement;
        if (now && now !== doc.body && now !== t) return;
        t.focus({ preventScroll: true });
        t.setSelectionRange(a, b);
        return;
      }
      // a field that never comes back, such as one whose note was closed, stops being waited for
      if (Date.now() - started < REFOCUS_FOR_MS) this.refocusTimer = window.setTimeout(attempt, 16);
    };
    attempt();
  }

  async flush(): Promise<void> {
    if (this.writeTimer !== null) {
      window.clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    await this.write();
  }

  focus(): void {
    this.el?.text.focus();
    if (this.el) this.kept.focused = true;
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

  /** Done, in place: writes what is left, then closes. */
  async done(): Promise<void> {
    await this.flush();
    this.onDone?.();
  }

  /** Takes the editor off the page, as Done does in place. */
  detach(): void {
    this.kept.focused = false;
    this.el?.root.remove();
    this.el = null;
    this.container = null;
  }

  private file(path = this.path): TFile | null {
    return this.app.vault.getFileByPath(path);
  }

  private key(): string {
    return `${this.path}#${this.session?.graph ?? ''}`;
  }

  // ── building the editor ───────────────────────────────────────────────────────────────────────────
  private render(): void {
    const container = this.container;
    if (!container) return;
    container.empty();
    this.el = null;
    this.drawing?.unload();
    this.drawing = null;
    const s = this.session;
    if (!s) {
      if (this.path) container.createEl('p', { text: 'This note has no graph block to edit.' });
      return;
    }
    const inline = this.layout === 'inline';
    const pane = container.createDiv({ cls: inline ? 'graph-note-pane graph-note-inline' : 'graph-note-pane' });

    const head = pane.createDiv({ cls: 'graph-note-pane-head' });
    const choices = s.choices();
    if (!inline && choices.length > 1) {
      const picker = head.createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Graph block' } });
      for (const c of choices) {
        const o = picker.createEl('option', { text: c.label, attr: { value: String(c.line) } });
        if (c.line === s.ref.line) o.setAttribute('selected', '');
      }
      picker.addEventListener('change', () => {
        void this.choose(Number(picker.value));
      });
    }
    const tools = head.createDiv({ cls: 'graph-note-pane-tools' });

    const draft = pane.createDiv({ cls: 'graph-note-draft', attr: { role: 'status' } });
    draft.hidden = true;

    let drawingEl: HTMLElement | null, textEl: HTMLElement;
    if (inline) {
      drawingEl = null; // in place, the card's own drawing is the drawing
      textEl = pane.createDiv({ cls: 'graph-note-pane-text' });
    } else if (Platform.isPhone) {
      const tabs = pane.createDiv({ cls: 'graph-note-tabs', attr: { role: 'tablist' } });
      drawingEl = pane.createDiv({ cls: 'graph-note-pane-drawing', attr: { role: 'tabpanel' } });
      textEl = pane.createDiv({ cls: 'graph-note-pane-text', attr: { role: 'tabpanel' } });
      const tab = (label: string, panel: HTMLElement, other: HTMLElement, selected: boolean) => {
        const b = tabs.createEl('button', {
          text: label,
          attr: { role: 'tab', type: 'button', 'aria-selected': String(selected) },
        });
        b.addEventListener('click', () => {
          panel.hidden = false;
          other.hidden = true;
          for (const x of Array.from(tabs.querySelectorAll('button'))) x.setAttribute('aria-selected', String(x === b));
          if (panel === drawingEl) this.redraw();
        });
      };
      tab('Drawing', drawingEl, textEl, false);
      tab('Text', textEl, drawingEl, true);
      drawingEl.hidden = true;
    } else {
      drawingEl = pane.createDiv({ cls: 'graph-note-pane-drawing' });
      textEl = pane.createDiv({ cls: 'graph-note-pane-text' });
    }

    const editor = textEl.createDiv({ cls: 'graph-note-editor' });
    // a div, not a pre: inside a note, Obsidian's own code-block styles would wrap and pad it out of step with the field
    const overlay = editor.createDiv({ cls: 'graph-note-overlay', attr: { 'aria-hidden': 'true' } });
    const name = editor.createSpan({ cls: 'graph-note-sr', text: `Text of graph ${s.graph}`, attr: { id: nextId() } });
    const text = editor.createEl('textarea', {
      cls: 'graph-note-text',
      attr: {
        spellcheck: 'false',
        autocapitalize: 'off',
        autocomplete: 'off',
        autocorrect: 'off',
        wrap: 'off',
        // named by a hidden label, not aria-label: Obsidian shows a tooltip for every aria-label
        'aria-labelledby': name.id,
      },
    });
    text.value = s.text;
    this.undoes = new TextHistory({ text: s.text, start: s.text.length, end: s.text.length });
    const fixbar = textEl.createDiv({ cls: 'graph-note-fixbar', attr: { role: 'status', 'aria-live': 'polite' } });
    fixbar.hidden = true;
    const suggest = textEl.createDiv({
      cls: 'graph-note-suggestions',
      attr: { role: 'toolbar', 'aria-label': 'Suggestions' },
    });
    suggest.hidden = true;
    const sheetParent = Platform.isPhone && !inline ? pane.createDiv({ cls: 'graph-note-sheet' }) : textEl;
    const list = sheetParent.createDiv({
      cls: 'graph-note-pane-problems',
      attr: { role: 'region', 'aria-label': 'Problems', 'aria-live': 'polite' },
    });

    const announce = pane.createDiv({
      cls: 'graph-note-announce graph-note-sr',
      attr: { role: 'status', 'aria-live': 'polite' },
    });
    this.el = { root: pane, text, overlay, fixbar, suggest, list, draft, drawing: drawingEl, tools, announce };
    this.registerDomEvent(text, 'input', () => this.typed());
    this.registerDomEvent(text, 'keyup', () => this.caretMoved());
    this.registerDomEvent(text, 'click', () => this.caretMoved());
    this.registerDomEvent(text, 'scroll', () => {
      overlay.scrollTop = text.scrollTop;
      overlay.scrollLeft = text.scrollLeft;
      this.kept.top = text.scrollTop;
      this.kept.left = text.scrollLeft;
    });
    this.registerDomEvent(text, 'focus', () => (this.kept.focused = true));
    // Left on purpose only if, once things settle, the field is still on the page without the focus. A field taken off
    // the page is still being typed in, however it comes back: in a new card handed the editor, or in the same card put
    // back as it was, as reading view does with no drawing in between (Roger's Mac, 9 Oct 2026); so its focus is given
    // back whenever it is on the page again, until the person goes elsewhere.
    // Chromium says blur while the field is still on the page, then takes it off: so it is judged a moment later, once
    // the taking off is done but before anything is drawn or put back.
    this.registerDomEvent(text, 'blur', () => {
      const a = text.selectionStart,
        b = text.selectionEnd;
      queueMicrotask(() => {
        if (!text.isConnected) {
          if (this.kept.focused) this.refocus(text, a, b);
        } else if (text.ownerDocument.activeElement !== text) this.kept.focused = false;
      });
    });
    // the person going to anything else ends it
    this.registerDomEvent(activeDocument, 'focusin', (e: FocusEvent) => {
      if (e.target !== text) this.kept.focused = false;
    });
    this.registerDomEvent(text, 'keydown', (e: KeyboardEvent) => {
      const first = this.suggestions.items[0];
      if (e.key === 'Tab' && !e.shiftKey && first) {
        e.preventDefault();
        this.accept(first);
        return;
      }
      const key = e.key.toLowerCase(),
        mod = e.metaKey || e.ctrlKey;
      if (mod && key === 'z') this.step(e, e.shiftKey ? 'redo' : 'undo');
      else if (e.ctrlKey && !e.metaKey && key === 'y') this.step(e, 'redo');
    });
    // the Edit menu's Undo and Redo, and a phone's undo gesture, arrive as these
    this.registerDomEvent(text, 'beforeinput', (e: InputEvent) => {
      if (e.inputType === 'historyUndo') this.step(e, 'undo');
      else if (e.inputType === 'historyRedo') this.step(e, 'redo');
    });

    this.analyse();
    this.heard = new Set(this.problems.map((d) => `${d.range.start.line}|${d.message}`));
    this.paint();
    this.redraw();
    this.showTools();
    this.showKeptDraft();
  }

  private showTools(): void {
    const el = this.el,
      s = this.session;
    if (!el || !s) return;
    el.tools.empty();
    if (this.layout === 'inline')
      button(
        el.tools,
        'Done',
        'check',
        () => {
          void this.done();
        },
        'Done',
      );
    button(el.tools, 'Undo', 'undo-2', () => {
      void this.history('undo');
    });
    button(el.tools, 'Redo', 'redo-2', () => {
      void this.history('redo');
    });
    if (this.reading && isDraft(this.reading, s.graph))
      button(
        el.tools,
        'Lock the graph',
        'lock',
        () => {
          void this.lock();
        },
        'Lock the graph',
      );
  }

  // ── typing ──────────────────────────────────────────────────────────────────────────────────────
  private typed(change: Change = 'typing'): void {
    const el = this.el,
      s = this.session;
    if (!el || !s) return;
    this.undoes?.record(this.state(), change);
    // what is added for you is a step of its own, so the very next undo takes back only it (spec §4)
    if (this.addForYou(s.text)) this.undoes?.record(this.state(), 'other');
    s.type(el.text.value);
    this.analyse();
    this.announce();
    this.paint();
    this.schedule();
  }

  /**
   * What is added for you as you type (spec §4): the comma, when the ( just typed starts the next pattern on a new line
   * and the line before is otherwise valid; the colon, when the ] just typed closes a link type written without one that
   * matches one type of the graph. Says whether it added one.
   */
  private addForYou(before: string): boolean {
    const t = this.el?.text;
    if (!t) return false;
    const v = t.value,
      caret = t.selectionStart ?? v.length;
    if (v.length !== before.length + 1 || v.slice(0, caret - 1) + v.slice(caret) !== before) return false;
    const at = commaFor(v, caret);
    if (at !== null) {
      t.value = v.slice(0, at) + ',' + v.slice(at);
      t.setSelectionRange(caret + 1, caret + 1);
      return true;
    }
    const line = this.session?.ref.line ?? 0;
    const earlier = gqlSpans(this.note)
      .filter((x) => x.open < line)
      .map((x) => x.text);
    const colon = colonFor(v, caret, earlier);
    if (!colon) return false;
    const was = v.slice(colon.from, colon.to);
    t.value = v.slice(0, colon.from) + colon.text + v.slice(colon.to);
    const moved = caret + colon.text.length - was.length;
    t.setSelectionRange(moved, moved);
    return true;
  }

  /** A text reloaded from the note, or changed there by Undo or Redo, starts the history again. */
  private restart(): void {
    this.undoes?.reset(this.state());
  }

  /** The field's text and selection, as the history keeps them. */
  private state(): TextState {
    const t = this.el?.text,
      text = t?.value ?? '';
    return { text, start: t?.selectionStart ?? text.length, end: t?.selectionEnd ?? text.length };
  }

  /** Undo or redo from the editor's own history, in place of the field's. */
  private step(e: Event, which: 'undo' | 'redo'): void {
    const t = this.el?.text;
    if (!t || !this.undoes) return;
    e.preventDefault();
    const to = which === 'undo' ? this.undoes.undo() : this.undoes.redo();
    if (!to) return;
    t.value = to.text;
    t.setSelectionRange(to.start, to.end);
    this.changed();
  }

  /** A change made for the person, such as one from the inspector: recorded as a step, analysed and written. */
  private typedAgain(): void {
    this.undoes?.record(this.state(), 'other');
    this.changed();
  }

  /** What the field now holds, analysed and written, without asking for another comma or colon. */
  private changed(): void {
    const el = this.el,
      s = this.session;
    if (!el || !s) return;
    s.type(el.text.value);
    this.analyse();
    this.announce();
    this.paint();
    this.schedule();
  }

  private caretMoved(): void {
    this.suggest();
    this.fixbar();
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
    this.reading = s.reading(this.note);
    this.onReading?.(this.reading);
    const block = gqlSpans(this.note).findIndex((x) => x.open === s.ref.line);
    this.problems = diagnostics(this.reading, s.graph, Math.max(0, block), s.text, `app://${this.path}`);
  }

  /** Says new problems to screen readers, without moving the focus. */
  private announce(): void {
    const el = this.el;
    if (!el) return;
    const now = this.problems.map((d) => ({ key: `${d.range.start.line}|${d.message}`, d }));
    const fresh = now.filter((x) => !this.heard.has(x.key));
    this.heard = new Set(now.map((x) => x.key));
    el.announce.setText(
      fresh.length ? `${fresh.length} new problem${fresh.length === 1 ? '' : 's'}: ${fresh[0]?.d.message ?? ''}` : '',
    );
  }

  // ── what the pane shows ─────────────────────────────────────────────────────────────────────────
  /** The coloured picture of the text: tokens, problems underlined with a sign at the end of their line, and each line read back. */
  private paint(): void {
    const el = this.el,
      s = this.session;
    if (!el || !s || !this.reading) return;
    const text = s.text,
      back = readBack(this.reading, s.graph, text);
    el.text.setAttribute('rows', String(text.split('\n').length + 1)); // grown to its text: it never scrolls apart from its colours
    const lines: { c: string | null; s: string }[][] = [[]];
    for (const t of tokenize(text)) {
      t.s.split('\n').forEach((piece, i) => {
        if (i) lines.push([]);
        if (piece) lines[lines.length - 1]?.push({ c: t.c, s: piece });
      });
    }
    el.overlay.empty();
    lines.forEach((parts, n) => {
      const marks = this.problems.filter((d) => d.range.start.line <= n && n <= d.range.end.line);
      const cut = (from: number, to: number) =>
        marks.find(
          (d) =>
            (d.range.start.line < n || d.range.start.character <= from) &&
            (d.range.end.line > n || to <= d.range.end.character),
        );
      let col = 0;
      for (const p of parts) {
        // split each token where a problem starts or ends, so the mark covers exactly the problem's words
        const edges = new Set([0, p.s.length]);
        for (const d of marks)
          for (const c of [
            d.range.start.line === n ? d.range.start.character : 0,
            d.range.end.line === n ? d.range.end.character : Infinity,
          ])
            if (c > col && c < col + p.s.length) edges.add(c - col);
        const cuts = [...edges].sort((a, b) => a - b);
        for (let i = 0; i < cuts.length - 1; i++) {
          const a = cuts[i] ?? 0,
            b = cuts[i + 1] ?? 0,
            piece = p.s.slice(a, b),
            d = cut(col + a, col + b);
          const cls = [
            p.c ? `gql-${p.c}` : '',
            d ? `graph-note-problem is-${d.severity === 1 ? 'error' : 'warning'}` : '',
          ]
            .filter(Boolean)
            .join(' ');
          if (cls) el.overlay.createSpan({ cls, text: piece });
          else el.overlay.appendText(piece);
        }
        col += p.s.length;
      }
      if (marks.length) el.overlay.createSpan({ cls: 'graph-note-line-sign', text: ' ⚠' });
      const said = back.get(n);
      if (said) el.overlay.createSpan({ cls: 'graph-note-readback', text: ` — ${said}` });
      el.overlay.appendText('\n');
    });
    this.list();
    this.fixbar();
    this.suggest();
  }

  private list(): void {
    const el = this.el;
    if (!el) return;
    el.list.empty();
    if (!this.problems.length) {
      el.list.createEl('p', { cls: 'graph-note-quiet', text: 'No problems.' });
      return;
    }
    const ul = el.list.createEl('ul');
    for (const d of this.problems) {
      const li = ul.createEl('li', { cls: d.severity === 1 ? 'is-error' : 'is-warning' });
      li.createSpan({ text: `Line ${d.range.start.line + 1}: ${d.message} ` });
      li.createSpan({ cls: 'graph-note-fix', text: d.data.fix });
    }
  }

  private caretLine(): number {
    const el = this.el;
    return el ? el.text.value.slice(0, el.text.selectionStart ?? 0).split('\n').length - 1 : 0;
  }

  /** The problems on the caret's line, each with its fixes as buttons: the fix offered in place. */
  private fixbar(): void {
    const el = this.el;
    if (!el) return;
    const here = this.problems.filter(
      (d) => d.range.start.line <= this.caretLine() && this.caretLine() <= d.range.end.line,
    );
    el.fixbar.empty();
    el.fixbar.hidden = !here.length;
    for (const d of here) {
      const row = el.fixbar.createDiv({ cls: d.severity === 1 ? 'is-error' : 'is-warning' });
      row.createSpan({ text: `⚠ ${d.message}` });
      for (const f of d.data.fixes) button(row, f.title, null, () => this.apply(f.edit.changes), f.title);
      if (!d.data.fixes.length) row.createSpan({ cls: 'graph-note-fix', text: ` ${d.data.fix}` });
    }
  }

  private apply(changes: Record<string, { range: Diagnostic['range']; newText: string }[]>): void {
    const el = this.el;
    if (!el) return;
    const lines = el.text.value.split('\n');
    const offset = (p: { line: number; character: number }) =>
      lines.slice(0, p.line).reduce((a, l) => a + l.length + 1, 0) + p.character;
    const edits = Object.values(changes)
      .flat()
      .sort((a, b) => offset(b.range.start) - offset(a.range.start));
    let v = el.text.value;
    for (const e of edits) v = v.slice(0, offset(e.range.start)) + e.newText + v.slice(offset(e.range.end));
    el.text.value = v;
    el.text.focus();
    this.typed('other');
  }

  /** Names, kinds and relationships already in the graph, offered where the caret is. */
  private suggest(): void {
    const el = this.el,
      s = this.session;
    if (!el || !s || !this.reading) return;
    const caret = el.text.selectionStart ?? el.text.value.length;
    this.suggestions = completions(this.reading, s.graph, el.text.value, caret);
    el.suggest.empty();
    el.suggest.hidden = !this.suggestions.items.length;
    for (const item of this.suggestions.items.slice(0, 12)) {
      const shown = item.insertText ?? item.label;
      button(el.suggest, item.detail ? `${shown} — ${item.detail}` : shown, null, () => this.accept(item), shown);
    }
  }

  private accept(item: CompletionItem): void {
    const el = this.el;
    if (!el) return;
    const caret = el.text.selectionStart ?? el.text.value.length,
      from = item.from ?? this.suggestions.from,
      text = item.insertText ?? item.label;
    el.text.value = el.text.value.slice(0, from) + text + el.text.value.slice(caret);
    el.text.setSelectionRange(from + text.length, from + text.length);
    el.text.focus();
    this.typed('other');
  }

  private redraw(): void {
    const el = this.el,
      s = this.session,
      host = el?.drawing;
    if (!el || !host || !s || !this.reading || host.hidden) return;
    const reading = this.reading,
      d = reading.graphs.get(s.graph);
    void this.plugin
      .graphviz()
      .then((engine) => {
        if (!this.el || this.el !== el) return;
        this.drawing?.unload();
        this.drawing = null;
        host.empty();
        if (!d || !d.boxes.length) {
          host.createEl('p', { cls: 'graph-note-quiet', text: 'Nothing to draw yet. Start with a thing.' });
          return;
        }
        const card = host.createDiv({ cls: 'graph-note' });
        const view = new GraphView(card, {
          reading,
          graph: s.graph,
          drawn: draw(d, engine),
          mode: 'pane',
          problems: reading.problems
            .filter((p) => p.graph === s.graph && reading.texts[p.block] === s.text)
            .map((p) => ({ ...p, noteLine: p.line })),
          lineOf: (at) => at.line,
          onEdit: () => el.text.focus(),
        });
        this.drawing = view;
        this.addChild(view);
      })
      .catch((e: unknown) => {
        host.empty();
        host.createDiv({
          cls: 'graph-note-banner',
          attr: { role: 'alert' },
          text: `The drawing engine could not start: ${String(e)}`,
        });
      });
  }

  // ── the note ────────────────────────────────────────────────────────────────────────────────────
  private async choose(line: number): Promise<void> {
    if (this.session?.dirty) await this.write();
    this.session?.select(line);
    this.render();
  }

  /** Writes what is typed into the note; a refused write reloads the block and keeps what was typed as a draft. */
  private async write(): Promise<void> {
    const s = this.session,
      file = this.file();
    if (!s || !file || !s.dirty) return;
    let refused: { reason: string; draft: string } | null = null;
    await this.app.vault.process(file, (data) => {
      const r = s.write(data);
      if (r.ok) {
        this.note = r.note;
        return r.note;
      }
      this.note = data;
      refused = { reason: r.reason, draft: r.draft };
      return data;
    });
    if (refused) await this.keepDraft(refused);
  }

  private async keepDraft({ reason, draft }: { reason: string; draft: string }): Promise<void> {
    const data = this.plugin.drafts();
    data[this.key()] = { text: draft, kept: new Date().toISOString() };
    await this.plugin.saveDrafts(data);
    if (this.el && this.session) this.el.text.value = this.session.text;
    this.restart();
    this.analyse();
    this.paint();
    this.redraw();
    this.showKeptDraft(
      `The block changed in the note while you were typing (${reason}), so it was reloaded. What you typed is kept as a draft.`,
    );
  }

  private showKeptDraft(message?: string): void {
    const el = this.el,
      kept = this.plugin.drafts()[this.key()];
    if (!el) return;
    el.draft.empty();
    el.draft.hidden = !kept;
    if (!kept) return;
    el.draft.createEl('p', {
      text: message ?? `A draft of this block, kept on ${kept.kept.slice(0, 16).replace('T', ' ')}, can be restored.`,
    });
    button(
      el.draft,
      'Restore draft',
      'rotate-ccw',
      () => {
        el.text.value = kept.text;
        void this.forget();
        this.typed('other');
      },
      'Restore draft',
    );
    button(
      el.draft,
      'Discard draft',
      'trash',
      () => {
        void this.forget();
      },
      'Discard draft',
    );
  }

  private async forget(): Promise<void> {
    if (this.el) this.el.draft.hidden = true;
    const data = this.plugin.drafts();
    delete data[this.key()];
    await this.plugin.saveDrafts(data);
  }

  private async onModify(f: TFile): Promise<void> {
    if (f.path !== this.path || !this.session) return;
    const text = await this.app.vault.read(f);
    if (text === this.note) return;
    this.note = text;
    const outcome = this.session.noteChanged(text);
    if (outcome === 'reloaded' && this.el) {
      this.el.text.value = this.session.text;
      this.restart();
      this.analyse();
      this.paint();
      this.redraw();
      this.showTools();
    } else if (outcome === 'conflict') await this.write();
    else {
      this.analyse();
      this.paint();
      this.showTools();
    }
  }

  private async history(which: 'undo' | 'redo'): Promise<void> {
    const s = this.session,
      file = this.file();
    if (!s || !file) return;
    if (this.writeTimer !== null) {
      window.clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    let refused: { reason: string; draft: string } | null = null;
    await this.app.vault.process(file, (data) => {
      const r = which === 'undo' ? s.undo(data) : s.redo(data);
      if (r.ok) {
        this.note = r.note;
        return r.note;
      }
      refused = { reason: r.reason, draft: r.draft };
      return data;
    });
    if (refused) {
      await this.keepDraft(refused);
      return;
    }
    if (this.el) this.el.text.value = s.text;
    this.restart();
    this.analyse();
    this.paint();
    this.redraw();
  }

  /** Lock the graph: writes its schema as a new block after the graph's last block in the note (spec §8). */
  private async lock(): Promise<void> {
    const s = this.session,
      file = this.file();
    if (!s || !file || !this.reading) return;
    if (s.dirty) await this.write();
    const block = lockBlock(s.reading(this.note), s.graph, new Date().toISOString().slice(0, 10));
    await this.app.vault.process(file, (data) => {
      const last = gqlSpans(data)
        .filter((x) => graphOfBlock(x.text) === s.graph)
        .pop();
      const r = last ? insertBlockAfter(data, { line: last.open, text: last.text }, block) : null;
      if (!r?.ok) {
        new Notice('The graph could not be locked: its block changed. Try again.');
        return data;
      }
      this.note = r.note;
      return r.note;
    });
    s.noteChanged(this.note);
    this.analyse();
    this.paint();
    this.showTools();
  }
}
