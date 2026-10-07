// The edit pane (spec §4, §9): a view beside the note, on one graph block. The text is a plain text field with a coloured
// picture of it behind (the field's own text is transparent), so typing, selection, undo and the phone's keyboard are the
// platform's own. Problems are marked in the picture and their fixes offered on the caret's line; suggestions sit under the
// field; each line is read back beside it. What is typed reaches the note within about a third of a second, through the
// core's session, which never overwrites a block changed meanwhile and keeps what was typed as a draft.
import { ItemView, Notice, Platform, TFile, setIcon } from 'obsidian';
import type { ViewStateResult, WorkspaceLeaf } from 'obsidian';
import { PaneSession, commaFor, namesSharedSchema, completions, diagnostics, draw, gqlSpans, graphOfBlock, insertBlockAfter, isDraft, lockBlock, readBack, tokenize } from '@graph-note/core';
import type { CompletionItem, Diagnostic, NoteReading } from '@graph-note/core';
import type GraphNotePlugin from './main';
import type { EditTarget } from './main';
import { GraphView } from './view';

export const PANE = 'graph-note-pane';
/** How long typing rests before it is written: well inside the third of a second the spec asks for. */
const WRITE_AFTER_MS = 150;
const DRAW_AFTER_MS = 250;

function button(parent: HTMLElement, label: string, icon: string | null, onClick: () => void, text?: string): HTMLButtonElement {
  const b = parent.createEl('button', { attr: { 'aria-label': label, type: 'button' } });
  if (icon) setIcon(b, icon);
  if (text) b.createSpan({ text });
  b.addEventListener('click', onClick);
  return b;
}

export class GraphPane extends ItemView {
  private readonly plugin: GraphNotePlugin;
  private path = '';
  private note = '';
  private session: PaneSession | null = null;
  private reading: NoteReading | null = null;
  private problems: Diagnostic[] = [];
  private suggestions: { from: number; items: CompletionItem[] } = { from: 0, items: [] };
  private writeTimer: number | null = null;
  private drawTimer: number | null = null;
  private drawing: GraphView | null = null;
  private el: {
    text: HTMLTextAreaElement; overlay: HTMLElement; fixbar: HTMLElement; suggest: HTMLElement; list: HTMLElement;
    draft: HTMLElement; drawing: HTMLElement; tools: HTMLElement; announce: HTMLElement;
  } | null = null;
  /** The problems already announced, so only new ones are (spec §8). */
  private heard = new Set<string>();

  constructor(leaf: WorkspaceLeaf, plugin: GraphNotePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return PANE; }
  getDisplayText(): string { return this.session ? `Graph ${this.session.graph}` : 'Graph'; }
  override getIcon(): string { return 'git-fork'; }

  override getState(): Record<string, unknown> {
    return { path: this.path, line: this.session?.ref.line ?? 0, graph: this.session?.graph ?? '' };
  }

  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const t = state as Partial<EditTarget>;
    if (this.session?.dirty) await this.write();
    if (typeof t.path === 'string') {
      const file = this.file(t.path);
      if (file) {
        this.path = t.path;
        this.note = await this.app.vault.read(file);
        try { this.session = new PaneSession(this.note, t.line ?? 0); } catch (e) { this.session = null; new Notice(String((e as Error).message)); }
        if (this.session && gqlSpans(this.note).some((x) => namesSharedSchema(x.text))) this.session.shared = await this.plugin.sharedSchemas();
        this.render();
      }
    }
    await super.setState(state, result);
  }

  override async onOpen(): Promise<void> {
    this.registerEvent(this.app.vault.on('modify', (f) => { if (f instanceof TFile) void this.onModify(f); }));
    await Promise.resolve();
  }

  override async onClose(): Promise<void> {
    if (this.session?.dirty) await this.write();
  }

  private file(path = this.path): TFile | null {
    return this.app.vault.getFileByPath(path);
  }

  private key(): string { return `${this.path}#${this.session?.graph ?? ''}`; }

  // ── building the pane ───────────────────────────────────────────────────────────────────────────
  private render(): void {
    const root = this.contentEl;
    root.empty();
    this.drawing?.unload(); this.drawing = null;
    const s = this.session;
    if (!s) { root.createEl('p', { text: 'This note has no graph block to edit.' }); return; }
    const pane = root.createDiv({ cls: 'graph-note-pane' });

    const head = pane.createDiv({ cls: 'graph-note-pane-head' });
    const choices = s.choices();
    if (choices.length > 1) {
      const picker = head.createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Graph block' } });
      for (const c of choices) {
        const o = picker.createEl('option', { text: c.label, attr: { value: String(c.line) } });
        if (c.line === s.ref.line) o.setAttribute('selected', '');
      }
      picker.addEventListener('change', () => { void this.choose(Number(picker.value)); });
    }
    const tools = head.createDiv({ cls: 'graph-note-pane-tools' });

    const draft = pane.createDiv({ cls: 'graph-note-draft', attr: { role: 'status' } });
    draft.hidden = true;

    let drawingEl: HTMLElement, textEl: HTMLElement;
    if (Platform.isPhone) {
      const tabs = pane.createDiv({ cls: 'graph-note-tabs', attr: { role: 'tablist' } });
      drawingEl = pane.createDiv({ cls: 'graph-note-pane-drawing', attr: { role: 'tabpanel' } });
      textEl = pane.createDiv({ cls: 'graph-note-pane-text', attr: { role: 'tabpanel' } });
      const tab = (label: string, panel: HTMLElement, other: HTMLElement, selected: boolean) => {
        const b = tabs.createEl('button', { text: label, attr: { role: 'tab', type: 'button', 'aria-selected': String(selected) } });
        b.addEventListener('click', () => {
          panel.hidden = false; other.hidden = true;
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
    const overlay = editor.createEl('pre', { cls: 'graph-note-overlay', attr: { 'aria-hidden': 'true' } });
    const text = editor.createEl('textarea', {
      cls: 'graph-note-text',
      attr: { spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', wrap: 'off', 'aria-label': `Text of graph ${s.graph}` },
    });
    text.value = s.text;
    const fixbar = textEl.createDiv({ cls: 'graph-note-fixbar', attr: { role: 'status', 'aria-live': 'polite' } });
    fixbar.hidden = true;
    const suggest = textEl.createDiv({ cls: 'graph-note-suggestions', attr: { role: 'toolbar', 'aria-label': 'Suggestions' } });
    suggest.hidden = true;
    const sheetParent = Platform.isPhone ? pane.createDiv({ cls: 'graph-note-sheet' }) : textEl;
    const list = sheetParent.createDiv({ cls: 'graph-note-pane-problems', attr: { role: 'region', 'aria-label': 'Problems', 'aria-live': 'polite' } });

    const announce = pane.createDiv({ cls: 'graph-note-announce graph-note-sr', attr: { role: 'status', 'aria-live': 'polite' } });
    this.el = { text, overlay, fixbar, suggest, list, draft, drawing: drawingEl, tools, announce };
    this.registerDomEvent(text, 'input', () => this.typed());
    this.registerDomEvent(text, 'keyup', () => this.caretMoved());
    this.registerDomEvent(text, 'click', () => this.caretMoved());
    this.registerDomEvent(text, 'scroll', () => { overlay.scrollTop = text.scrollTop; overlay.scrollLeft = text.scrollLeft; });
    this.registerDomEvent(text, 'keydown', (e: KeyboardEvent) => {
      const first = this.suggestions.items[0];
      if (e.key === 'Tab' && !e.shiftKey && first) { e.preventDefault(); this.accept(first); return; }
      this.undoComma(e);
    });

    this.analyse();
    this.heard = new Set(this.problems.map((d) => `${d.range.start.line}|${d.message}`));
    this.paint();
    this.redraw();
    this.showTools();
    this.showKeptDraft();
  }

  private showTools(): void {
    const el = this.el, s = this.session;
    if (!el || !s) return;
    el.tools.empty();
    button(el.tools, 'Undo', 'undo-2', () => { void this.history('undo'); });
    button(el.tools, 'Redo', 'redo-2', () => { void this.history('redo'); });
    if (this.reading && isDraft(this.reading, s.graph)) button(el.tools, 'Lock the graph', 'lock', () => { void this.lock(); }, 'Lock the graph');
  }

  // ── typing ──────────────────────────────────────────────────────────────────────────────────────
  private typed(): void {
    const el = this.el, s = this.session;
    if (!el || !s) return;
    this.addComma(s.text);
    s.type(el.text.value);
    this.analyse();
    this.announce();
    this.paint();
    this.schedule();
  }

  /** The comma just added for you, and the text it left, so the very next undo takes back only it (spec §4). */
  private autoComma: { at: number; value: string } | null = null;

  /**
   * The comma added for you (spec §4): when the ( just typed starts the next pattern on a new line, and the line before is
   * otherwise valid, the comma goes at the end of that line. The very next undo takes it back, and only it.
   */
  private addComma(before: string): void {
    const t = this.el?.text;
    this.autoComma = null;
    if (!t) return;
    const v = t.value, caret = t.selectionStart ?? v.length;
    if (v.length !== before.length + 1 || v.slice(0, caret - 1) + v.slice(caret) !== before) return;
    const at = commaFor(v, caret);
    if (at === null) return;
    t.value = v.slice(0, at) + ',' + v.slice(at);
    t.setSelectionRange(caret + 1, caret + 1);
    this.autoComma = { at, value: t.value };
  }

  /** Undo straight after a comma was added for you: takes back the comma alone. */
  private undoComma(e: KeyboardEvent): void {
    const t = this.el?.text, c = this.autoComma;
    if (!t || !c || e.key.toLowerCase() !== 'z' || e.shiftKey || !(e.metaKey || e.ctrlKey) || t.value !== c.value) return;
    e.preventDefault();
    const caret = (t.selectionStart ?? t.value.length) - 1;
    t.value = t.value.slice(0, c.at) + t.value.slice(c.at + 1);
    t.setSelectionRange(caret, caret);
    this.autoComma = null;
    this.typedAgain();
  }

  /** What was typed, analysed and written, without asking for another comma. */
  private typedAgain(): void {
    const el = this.el, s = this.session;
    if (!el || !s) return;
    s.type(el.text.value);
    this.analyse(); this.announce(); this.paint(); this.schedule();
  }

  private caretMoved(): void {
    this.suggest();
    this.fixbar();
  }

  private schedule(): void {
    const w = window;
    if (this.writeTimer !== null) w.clearTimeout(this.writeTimer);
    this.writeTimer = w.setTimeout(() => { this.writeTimer = null; void this.write(); }, WRITE_AFTER_MS);
    if (this.drawTimer !== null) w.clearTimeout(this.drawTimer);
    this.drawTimer = w.setTimeout(() => { this.drawTimer = null; this.redraw(); }, DRAW_AFTER_MS);
  }

  /** Reads what is typed: the problems, and the reading the suggestions and the read-back come from. */
  private analyse(): void {
    const s = this.session;
    if (!s) return;
    this.reading = s.reading(this.note);
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
    el.announce.setText(fresh.length ? `${fresh.length} new problem${fresh.length === 1 ? '' : 's'}: ${fresh[0]?.d.message ?? ''}` : '');
  }

  // ── what the pane shows ─────────────────────────────────────────────────────────────────────────
  /** The coloured picture of the text: tokens, problems underlined with a sign at the end of their line, and each line read back. */
  private paint(): void {
    const el = this.el, s = this.session;
    if (!el || !s || !this.reading) return;
    const text = s.text, back = readBack(this.reading, s.graph, text);
    el.text.setAttribute('rows', String(text.split('\n').length + 1));   // grown to its text: it never scrolls apart from its colours
    const lines: { c: string | null; s: string }[][] = [[]];
    for (const t of tokenize(text)) {
      t.s.split('\n').forEach((piece, i) => { if (i) lines.push([]); if (piece) lines[lines.length - 1]?.push({ c: t.c, s: piece }); });
    }
    el.overlay.empty();
    lines.forEach((parts, n) => {
      const marks = this.problems.filter((d) => d.range.start.line <= n && n <= d.range.end.line);
      const cut = (from: number, to: number) => marks.find((d) => (d.range.start.line < n || d.range.start.character <= from) && (d.range.end.line > n || to <= d.range.end.character));
      let col = 0;
      for (const p of parts) {
        // split each token where a problem starts or ends, so the mark covers exactly the problem's words
        const edges = new Set([0, p.s.length]);
        for (const d of marks) for (const c of [d.range.start.line === n ? d.range.start.character : 0, d.range.end.line === n ? d.range.end.character : Infinity]) if (c > col && c < col + p.s.length) edges.add(c - col);
        const cuts = [...edges].sort((a, b) => a - b);
        for (let i = 0; i < cuts.length - 1; i++) {
          const a = cuts[i] ?? 0, b = cuts[i + 1] ?? 0, piece = p.s.slice(a, b), d = cut(col + a, col + b);
          const cls = [p.c ? `gql-${p.c}` : '', d ? `graph-note-problem is-${d.severity === 1 ? 'error' : 'warning'}` : ''].filter(Boolean).join(' ');
          if (cls) el.overlay.createSpan({ cls, text: piece }); else el.overlay.appendText(piece);
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
    if (!this.problems.length) { el.list.createEl('p', { cls: 'graph-note-quiet', text: 'No problems.' }); return; }
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
    const here = this.problems.filter((d) => d.range.start.line <= this.caretLine() && this.caretLine() <= d.range.end.line);
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
    const offset = (p: { line: number; character: number }) => lines.slice(0, p.line).reduce((a, l) => a + l.length + 1, 0) + p.character;
    const edits = Object.values(changes).flat().sort((a, b) => offset(b.range.start) - offset(a.range.start));
    let v = el.text.value;
    for (const e of edits) v = v.slice(0, offset(e.range.start)) + e.newText + v.slice(offset(e.range.end));
    el.text.value = v;
    el.text.focus();
    this.typed();
  }

  /** Names, kinds and relationships already in the graph, offered where the caret is. */
  private suggest(): void {
    const el = this.el, s = this.session;
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
    const caret = el.text.selectionStart ?? el.text.value.length, from = item.from ?? this.suggestions.from, text = item.insertText ?? item.label;
    el.text.value = el.text.value.slice(0, from) + text + el.text.value.slice(caret);
    el.text.setSelectionRange(from + text.length, from + text.length);
    el.text.focus();
    this.typed();
  }

  private redraw(): void {
    const el = this.el, s = this.session;
    if (!el || !s || !this.reading || el.drawing.hidden) return;
    const reading = this.reading, d = reading.graphs.get(s.graph);
    void this.plugin.graphviz().then((engine) => {
      if (!this.el || this.el !== el) return;
      this.drawing?.unload(); this.drawing = null;
      el.drawing.empty();
      if (!d || !d.boxes.length) { el.drawing.createEl('p', { cls: 'graph-note-quiet', text: 'Nothing to draw yet. Start with a thing.' }); return; }
      const host = el.drawing.createDiv({ cls: 'graph-note' });
      const view = new GraphView(host, {
        reading, graph: s.graph, drawn: draw(d, engine), mode: 'pane',
        problems: reading.problems.filter((p) => p.graph === s.graph && reading.texts[p.block] === s.text).map((p) => ({ ...p, noteLine: p.line })),
        lineOf: (at) => at.line, onEdit: () => el.text.focus(),
      });
      this.drawing = view;
      this.addChild(view);
    }).catch((e: unknown) => {
      el.drawing.empty();
      el.drawing.createDiv({ cls: 'graph-note-banner', attr: { role: 'alert' }, text: `The drawing engine could not start: ${String(e)}` });
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
    const s = this.session, file = this.file();
    if (!s || !file || !s.dirty) return;
    let refused: { reason: string; draft: string } | null = null;
    await this.app.vault.process(file, (data) => {
      const r = s.write(data);
      if (r.ok) { this.note = r.note; return r.note; }
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
    this.analyse(); this.paint(); this.redraw();
    this.showKeptDraft(`The block changed in the note while you were typing (${reason}), so it was reloaded. What you typed is kept as a draft.`);
  }

  private showKeptDraft(message?: string): void {
    const el = this.el, kept = this.plugin.drafts()[this.key()];
    if (!el) return;
    el.draft.empty();
    el.draft.hidden = !kept;
    if (!kept) return;
    el.draft.createEl('p', { text: message ?? `A draft of this block, kept on ${kept.kept.slice(0, 16).replace('T', ' ')}, can be restored.` });
    button(el.draft, 'Restore draft', 'rotate-ccw', () => {
      el.text.value = kept.text;
      void this.forget();
      this.typed();
    }, 'Restore draft');
    button(el.draft, 'Discard draft', 'trash', () => { void this.forget(); }, 'Discard draft');
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
    if (outcome === 'reloaded' && this.el) { this.el.text.value = this.session.text; this.analyse(); this.paint(); this.redraw(); this.showTools(); }
    else if (outcome === 'conflict') await this.write();
    else { this.analyse(); this.paint(); this.showTools(); }
  }

  private async history(which: 'undo' | 'redo'): Promise<void> {
    const s = this.session, file = this.file();
    if (!s || !file) return;
    if (this.writeTimer !== null) { window.clearTimeout(this.writeTimer); this.writeTimer = null; }
    let refused: { reason: string; draft: string } | null = null;
    await this.app.vault.process(file, (data) => {
      const r = which === 'undo' ? s.undo(data) : s.redo(data);
      if (r.ok) { this.note = r.note; return r.note; }
      refused = { reason: r.reason, draft: r.draft };
      return data;
    });
    if (refused) { await this.keepDraft(refused); return; }
    if (this.el) this.el.text.value = s.text;
    this.analyse(); this.paint(); this.redraw();
  }

  /** Lock the graph: writes its schema as a new block after the graph's last block in the note (spec §8). */
  private async lock(): Promise<void> {
    const s = this.session, file = this.file();
    if (!s || !file || !this.reading) return;
    if (s.dirty) await this.write();
    const block = lockBlock(s.reading(this.note), s.graph, new Date().toISOString().slice(0, 10));
    await this.app.vault.process(file, (data) => {
      const last = gqlSpans(data).filter((x) => graphOfBlock(x.text) === s.graph).pop();
      const r = last ? insertBlockAfter(data, { line: last.open, text: last.text }, block) : null;
      if (!r?.ok) { new Notice('The graph could not be locked: its block changed. Try again.'); return data; }
      this.note = r.note;
      return r.note;
    });
    s.noteChanged(this.note);
    this.analyse(); this.paint(); this.showTools();
  }
}
