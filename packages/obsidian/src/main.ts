// Graph Note: draws the graphs written in notes (spec §3), and edits them in a pane beside the note (spec §4).
import { Notice, Plugin, TFile, editorInfoField } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import type { MarkdownPostProcessorContext } from 'obsidian';
import { gqlBlocks, isSharedSchema, LAYOUT_LIMITS, settingsFrom, standardBlocks, toStandard } from '@graph-note/core';
import type {
  Converted,
  Drawn,
  Engine,
  GraphDrawing,
  LayoutLimits,
  PngSize,
  Refusal,
  Settings,
} from '@graph-note/core';
import { exportGraph } from './export/export';
import type { ExportAsk, ExportOutcome } from './export/export';
import { rasterise } from './export/png';
import { GraphNoteSettingTab } from './settings/settings';
import type { DeclaredList } from './properties/list-row';
import type { Editing } from './graph-view/view-options';
import { engineOnThePage, Layouts } from './layout-worker/layout-worker';
import { renderShown } from './block';
import { GraphPane, PANE } from './pane';
import { addForYou } from './editor';
import { BlockEditor } from './block-editor/block-editor';
import { graphBlocks } from './live-preview';

/** Where Edit was pressed: the note, the line of the block's opening fence (0-based), and the graph it draws. */
export interface EditTarget {
  path: string;
  line: number;
  graph: string;
}

/** What was typed in the pane and kept when the note changed under it, by note and graph: never lost (spec §9). */
export type Drafts = Record<string, { text: string; kept: string }>;

interface Saved {
  drafts?: Drafts;
  settings?: unknown;
}

/** The plugin: draws each graph block, opens the editors, and keeps the drafts and the shared schemas. */
export default class GraphNotePlugin extends Plugin {
  private engine: Promise<Engine> | null = null;
  private saved: Saved = {};
  /** The vault's shared schema blocks, by note: read once, the first time a graph names one, then kept up to date. */
  private schemas: Map<string, string[]> | null = null;

  override async onload(): Promise<void> {
    this.saved = ((await this.loadData()) as Saved | null) ?? {};
    this.settings = settingsFrom(this.saved.settings);
    this.addSettingTab(new GraphNoteSettingTab(this.app, this));
    this.addCommand({
      id: 'convert-to-standard',
      name: 'Convert this note to standard GQL',
      callback: () => this.convertToStandard(),
    });
    this.registerView(PANE, (leaf) => new GraphPane(leaf, this));
    this.registerEditorExtension(addForYou);
    // in Live Preview the plugin draws graph blocks itself, so a card being typed in is never torn down (spec §4)
    this.registerEditorExtension(graphBlocks(this));
    try {
      this.registerMarkdownCodeBlockProcessor(
        'gql',
        (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => renderShown(this, source, el, ctx),
      );
    } catch (e) {
      // Only one plugin may draw a code block language. Say which setting to change, rather than fail quietly.
      console.error('Graph Note could not take gql blocks', e);
      new Notice(
        'Another plugin already draws gql blocks, so graphs cannot be drawn. Update or turn off the gql-highlight plugin, then reload Obsidian.',
        0,
      );
    }
  }

  /** Every shared schema block in the vault (§5), for graphs that name one. */
  async sharedSchemas(): Promise<string[]> {
    if (!this.schemas) {
      const found = new Map<string, string[]>();
      const read = async (f: TFile) => {
        const blocks = gqlBlocks(await this.app.vault.cachedRead(f))
          .map((b) => b.text)
          .filter(isSharedSchema);
        if (blocks.length) found.set(f.path, blocks);
        else found.delete(f.path);
      };
      for (const f of this.app.vault.getMarkdownFiles()) await read(f);
      this.schemas = found;
      this.registerEvent(
        this.app.vault.on('modify', (f) => {
          if (f instanceof TFile && f.extension === 'md') void read(f);
        }),
      );
    }
    return [...this.schemas.values()].flat();
  }

  /** Every option the editor offers (spec §21), as set on the settings page. */
  override settings: Settings = settingsFrom(null);

  /** Who to tell when a setting that changes how a graph is read or drawn has changed: each drawing and editor. */
  private readonly settingsWatchers = new Set<() => void>();

  /** Tells `changed` each time a setting that changes how a graph is read or drawn changes; returns how to stop. */
  watchSettings(changed: () => void): () => void {
    this.settingsWatchers.add(changed);
    return () => this.settingsWatchers.delete(changed);
  }

  /**
   * Saves the settings, read back as the core reads them, so nothing out of range or secret is kept; and when the
   * strictness or the drawing direction changed, every drawing and editor already shown reads and draws again.
   */
  async saveSettings(next: Settings): Promise<void> {
    const was = this.settings;
    this.settings = settingsFrom(next);
    this.saved = { ...this.saved, settings: this.settings };
    await this.saveData(this.saved);
    const shown = (s: Settings) => JSON.stringify([s.strictness, s.allowed, s.direction]);
    if (shown(was) !== shown(this.settings)) for (const changed of [...this.settingsWatchers]) changed();
  }

  /** Converts the note in front back to standard GQL (spec §21), checked by the standard checker before it is written. */
  async convertToStandard(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice('Open a note to convert it to standard GQL.');
      return;
    }
    const checked = toStandard(await this.app.vault.read(file));
    if (!checked.ok) {
      new Notice(`Not converted: ${checked.reason}`);
      return;
    }
    if (!checked.changed) {
      new Notice('This note is already standard GQL.');
      return;
    }
    // written against the note as it is when written, and checked again there: said only when it was written
    let written: Converted = checked;
    await this.app.vault.process(file, (now) => {
      written = toStandard(now);
      return written.ok ? written.note : now;
    });
    const done = written as Converted;
    if (!done.ok) new Notice(`Not converted: the note changed meanwhile, and ${done.reason}`);
    else if (!done.changed) new Notice('This note is already standard GQL.');
    else new Notice(`Converted ${done.changed} departure${done.changed === 1 ? '' : 's'} to standard GQL.`);
  }

  /**
   * What an engine or an export is given of a note's gql blocks (spec §21): standard GQL, whatever the strictness.
   * Throws, naming the block, when one could not be made standard: it is never handed over as if it were.
   */
  async standardGql(path: string): Promise<string[]> {
    const file = this.app.vault.getFileByPath(path);
    if (!file) return [];
    const given = standardBlocks(gqlBlocks(await this.app.vault.cachedRead(file)).map((b) => b.text));
    if (given.left.length) throw new Error(`block ${(given.left[0] ?? 0) + 1} could not be made standard GQL`);
    return given.blocks;
  }

  drafts(): Drafts {
    return { ...(this.saved.drafts ?? {}) };
  }

  async saveDrafts(drafts: Drafts): Promise<void> {
    this.saved = { ...this.saved, drafts };
    await this.saveData(this.saved);
  }

  /**
   * Starts the Graphviz engine on the page's own thread, for where no worker can run. Kept separate so a test can stand
   * in a failing one.
   */
  loadEngine(): Promise<Engine> {
    return engineOnThePage();
  }

  /** The Graphviz engine on the page's own thread, started once, the first time a graph is laid out there. */
  graphviz(): Promise<Engine> {
    this.engine ??= this.loadEngine();
    return this.engine;
  }

  /** How large a graph may be, and how long its layout may take, before it is shown as text (spec §9): a settings hook. */
  readonly layoutLimits: LayoutLimits = { ...LAYOUT_LIMITS };

  /** Exports a graph or a view as an image (spec §16): see export/export.ts. */
  exportGraph(ask: ExportAsk): Promise<ExportOutcome> {
    return exportGraph(this, ask);
  }

  /** A PNG of an exported SVG at `size` (spec §16): kept apart so a test can stand in one, as it can the engine. */
  rasterise(svg: string, size: PngSize): Promise<Uint8Array> {
    return rasterise(svg, size);
  }

  private layouts: Layouts | null = null;
  private unloaded = false;

  /**
   * A graph laid out and themed apart from the interface, in one worker reused for every block (spec §9,
   * layout_contained); or why it is shown as text; or null when it is no longer wanted — a newer drawing for the same
   * `owner` (a card, an editor) asked for before it started, or the plugin unloaded. Rejects when the engine cannot start.
   */
  layout(drawing: GraphDrawing, owner?: object): Promise<Drawn | Refusal | null> {
    if (this.unloaded) return Promise.resolve(null);
    this.layouts ??= new Layouts(
      () => this.layoutLimits,
      () => this.graphviz(),
    );
    // the direction set on the settings page, one the locked style allows (spec §21); else the best fit
    // a direction the graph's own style sets (§6) comes before the settings' default
    const { direction } = this.settings;
    const keep = direction === 'best' || !!drawing.direction;
    return this.layouts.draw(keep ? drawing : { ...drawing, direction }, owner);
  }

  override onunload(): void {
    this.unloaded = true;
    this.layouts?.close();
    this.layouts = null;
  }

  /** The editors (CodeMirror views) open on notes in the editing view, as the plugin's editor extension sees them. */
  readonly editorViews = new Set<EditorView>();

  /** An editor open on the note at `path`, if there is one: where a change to it is written. */
  editorFor(path: string): EditorView | null {
    for (const v of this.editorViews) if (v.state.field(editorInfoField, false)?.file?.path === path) return v;
    return null;
  }

  /** The lists made in this session, by note and graph: kept here so they outlive each editor in place. */
  private readonly declared = new Map<string, DeclaredList[]>();

  /** The lists made in this session on a note's graph, shared by every editor opened on it. */
  declaredLists(path: string, graph: string): DeclaredList[] {
    const key = `${path}#${graph}`;
    return this.declared.get(key) ?? this.declared.set(key, []).get(key)!;
  }

  /** The editors open in place, in drawings' cards: they outlive each redraw of their block. */
  private readonly inline = new Set<BlockEditor>();

  /** Who to tell when an editor in place opens or closes: each card's edit button. */
  private readonly inlineWatchers = new Set<() => void>();

  /** Tells `changed` each time an editor in place opens or closes; returns how to stop. */
  watchInline(changed: () => void): () => void {
    this.inlineWatchers.add(changed);
    return () => this.inlineWatchers.delete(changed);
  }

  private inlineChanged(): void {
    for (const changed of this.inlineWatchers) changed();
  }

  /** The editor open in place on a note's block, by the line of its opening fence, if there is one. */
  inlineFor(path: string, line: number): BlockEditor | undefined {
    return [...this.inline].find((e) => e.path === path && e.session?.ref.line === line);
  }

  /** Edit here: opens the block's text in place, inside its drawing's card (spec §4), with the focus in it. */
  async editHere(target: EditTarget, slot: HTMLElement): Promise<void> {
    let editor = this.inlineFor(target.path, target.line);
    if (!editor) {
      const e = new BlockEditor(this, 'inline');
      // a setting that changes how the text is read or drawn: read again at once (spec §21)
      e.register(this.watchSettings(() => e.changed()));
      e.onDone = () => {
        this.inline.delete(e);
        e.detach();
        this.removeChild(e);
        this.inlineChanged();
      };
      this.inline.add(e);
      this.addChild(e);
      e.mount(slot);
      await e.open(target.path, target.line);
      // the lists made in this session outlive this editor: Done, then Edit here again, still offers them
      (e as Editing).lists = this.declaredLists(target.path, e.session?.graph ?? '');
      editor = e;
      this.inlineChanged();
    } else editor.mount(slot);
    editor.focus();
  }

  /** Opens the edit pane beside the note, on a block (spec §4); one pane, reused. */
  async openEditor(target: EditTarget): Promise<void> {
    const { workspace } = this.app;
    const leaf = workspace.getLeavesOfType(PANE)[0] ?? workspace.getLeaf('split', 'vertical');
    await leaf.setViewState({ type: PANE, state: { ...target }, active: true });
    await workspace.revealLeaf(leaf);
  }
}
