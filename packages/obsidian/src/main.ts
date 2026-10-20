// ThoughtKnot: draws the graphs written in notes (spec §3), and edits them in a pane beside the note (spec §4).
import { Notice, Plugin, TFile, editorInfoField } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import type { MarkdownPostProcessorContext } from 'obsidian';
import {
  gqlBlocks,
  isSharedSchema,
  LAYOUT_LIMITS,
  settingsFrom,
  shownAsRead,
  standardBlocks,
  startingSwitches,
  SWITCH_SETTINGS,
  toStandard,
  VIEW_SWITCHES,
  ViewState,
  withStandardSchemas,
} from '@thoughtknot/core';
import type {
  Converted,
  Drawn,
  Engine,
  ExportTheme,
  GraphDrawing,
  LayoutLimits,
  PictureBox,
  PngSize,
  ProposalReview,
  Refusal,
  SendRecord,
  Settings,
  StyleGraph,
} from '@thoughtknot/core';
import { SENDS_KEPT, addAskCommands, sqliteQuery } from './commands';
import { exportGraph, type ExportAsk, type ExportOutcome } from './export/export';
import { PNG_PIXEL_LIMIT, rasterise } from './export/png';
import { installObsidianHost } from './display-host';
import { directed } from '@thoughtknot/core/display/editor/pane-drawing';
import { stillFrame } from '@thoughtknot/core/display/images/still-frame';
import { vaultImages } from './images/vault-images';
import type { CardImages } from '@thoughtknot/core/display/graph-view/animated-images';
import { aidsOf } from '@thoughtknot/core/display/graph-view/viewer-aids';
import { ThoughtKnotSettingTab } from './settings/settings';
import type { DeclaredList } from '@thoughtknot/core/display/properties/list-row';
import { engineOnThePage, Layouts } from './layout-worker/layout-worker';
import { renderShown } from './block';
import { GraphPane, PANE } from './pane';
import { addForYou } from './editor';
import type { BlockEditor } from './block-editor/block-editor';
import { graphBlocks } from './live-preview';
import { InlineEditors } from './inline-editors';
import { followRename, recoverDrafts, RECOVER_COMMAND, withIds } from './drafts';
import type { KeptDraft } from '@thoughtknot/core/display/editor/editor-note';
import { noteToRewrite, stillToRewrite } from './reading-view';
import { followLinks } from './links/rename-follow';
import { HOVER_SOURCE } from './links/link-host';

/** Where Edit was pressed: the note, the line of the block's opening fence (0-based), and the graph it draws. */
export interface EditTarget {
  path: string;
  line: number;
  graph: string;
}

/** What was typed in the pane and kept when the note changed under it, by note and graph: never lost (spec §9). */
export type Drafts = Record<string, KeptDraft>;

interface Saved {
  drafts?: Drafts;
  settings?: unknown;
  /** The record of every send to an AI model (§19, record_every_send): never a key. */
  aiSends?: SendRecord[];
}

/** The plugin: draws each graph block, opens the editors, and keeps the drafts and the shared schemas. */
export default class ThoughtKnotPlugin extends Plugin {
  private engine: Promise<Engine> | null = null;
  private saved: Saved = {};
  /** The vault's shared schema blocks, by note: read once, the first time a graph names one, then kept up to date. */
  private schemas: Map<string, string[]> | null = null;

  override async onload(): Promise<void> {
    installObsidianHost(); // the display layer draws in Obsidian from here on
    this.saved = ((await this.loadData()) as Saved | null) ?? {};
    // drafts kept before ids are given theirs, and saved at once, so each keeps the same id from one load to the next
    if (Object.values(this.saved.drafts ?? {}).some((d) => !d.id)) await this.saveDrafts(this.drafts());
    this.settings = settingsFrom(this.saved.settings);
    this.addSettingTab(new ThoughtKnotSettingTab(this.app, this));
    this.addCommand({
      id: 'convert-to-standard',
      name: 'Convert this note to standard GQL',
      callback: () => this.convertToStandard(),
    });
    // the drafts kept follow their note when it is renamed or moved, edited or not, and can all be recovered (spec §9)
    this.registerEvent(this.app.vault.on('rename', (f, old) => void followRename(this, f.path, old)));
    // a renamed note or file is followed by every link to it in graph blocks; Page preview previews the cards' links (§18)
    this.registerEvent(this.app.vault.on('rename', (f, old) => void followLinks(this, f, old)));
    this.registerHoverLinkSource(HOVER_SOURCE, { display: 'ThoughtKnot', defaultMod: true });
    this.addCommand({ ...RECOVER_COMMAND, callback: () => recoverDrafts(this) });
    addAskCommands(this); // nothing is sent to an AI or read from a database until the user presses Send or Import
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
      console.error('ThoughtKnot could not take gql blocks', e);
      new Notice(
        'Another plugin already draws gql blocks, so graphs cannot be drawn. Update or turn off the gql-highlight plugin, then reload Obsidian.',
        0,
      );
    }
  }

  /** Every shared schema block in the vault (§5), then each standard one the vault has none of its name of (§27). */
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
    return withStandardSchemas([...this.schemas.values()].flat());
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
   * Saves the settings, read back as the core reads them, so nothing out of range or secret is kept. When the strictness
   * or the drawing direction changed, every drawing and editor already shown reads and draws again.
   */
  async saveSettings(next: Settings): Promise<void> {
    const was = this.settings;
    this.settings = settingsFrom(next);
    this.saved = { ...this.saved, settings: this.settings };
    await this.saveData(this.saved);
    // the View menu's defaults too (§25): every graph starts again from them, until its View menu changes them
    const switches = (s: Settings) => VIEW_SWITCHES.map((v) => s[SWITCH_SETTINGS[v]]);
    if (JSON.stringify(switches(was)) !== JSON.stringify(switches(this.settings))) this.viewStates.clear();
    const shown = (s: Settings) =>
      JSON.stringify([s.strictness, s.allowed, s.direction, s.focusDepth, s.noteCallouts, aidsOf(s), switches(s)]);
    if (shown(was) !== shown(this.settings)) for (const changed of [...this.settingsWatchers]) changed();
  }

  /** Each graph's View menu state (§25), by note, graph and view: kept while the plugin runs, never saved. */
  private readonly viewStates = new Map<string, ViewState>();

  /**
   * The View menu's state of a graph, or of one of its views, in a note (§25). It is the same for every card that draws
   * it, so a card drawn again keeps it. Started from the settings, the style graph's merging and a view saved as shown
   * (view_switch_defaults). It is the drawing's alone, never written to the note (view_switch_view_only).
   */
  switchesFor(path: string, graph: string, style: StyleGraph, view?: string): ViewState {
    // where it starts is part of the key: a Links merging or a view saved as shown, written since, starts it afresh
    const start = startingSwitches(this.settings, style, view);
    const key = [path, graph, view ?? '', JSON.stringify(start)].join('\u0000');
    const state = this.viewStates.get(key) ?? new ViewState(start);
    this.viewStates.set(key, state);
    return state;
  }

  /** Converts the note in front back to standard GQL (spec §21), checked by the standard checker before it is written. */
  async convertToStandard(): Promise<void> {
    // the note in the pane in front, unless that pane is in reading view, which never changes a note (spec §3)
    const to = 'to convert it to standard GQL';
    const front = noteToRewrite(this.app.workspace, to);
    if (!front) return;
    const { file } = front;
    const checked = toStandard(await this.app.vault.read(file));
    if (!checked.ok) {
      new Notice(`Not converted: ${checked.reason}`);
      return;
    }
    if (!checked.changed) {
      new Notice('This note is already standard GQL.');
      return;
    }
    // the pane in front is asked again now, after the waiting: one switched to reading view meanwhile is not written
    if (!stillToRewrite(this.app.workspace, front, to)) return;
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

  /** The drafts kept, by note and graph; one kept before drafts had ids is given its id here, once (drafts.ts). */
  drafts(): Drafts {
    this.saved.drafts = withIds(this.saved.drafts ?? {});
    return { ...this.saved.drafts };
  }

  async saveDrafts(drafts: Drafts): Promise<void> {
    this.saved = { ...this.saved, drafts };
    await this.saveData(this.saved);
  }

  /** Keeps the record of one send to an AI model with the last ones before it (§19, record_every_send). */
  async recordAiSend(record: SendRecord): Promise<void> {
    this.saved = { ...this.saved, aiSends: [...(this.saved.aiSends ?? []), record].slice(-SENDS_KEPT) };
    await this.saveData(this.saved);
  }

  /** Clears the record of sends to AI models; gives how many there were. */
  async clearAiSends(): Promise<number> {
    const n = this.saved.aiSends?.length ?? 0;
    this.saved = { ...this.saved, aiSends: [] };
    await this.saveData(this.saved);
    return n;
  }

  /**
   * Starts the Graphviz engine on the page's own thread, for where no worker can run. Kept separate so a test can stand
   * in a failing one.
   */
  loadEngine(): Promise<Engine> {
    return engineOnThePage();
  }

  /** Runs an import's queries on the bytes of a SQLite file in the vault: a test may stand in its own. */
  queryDatabase = sqliteQuery;
  /** The Graphviz engine on the page's own thread, started once, the first time a graph is laid out there. */
  graphviz(): Promise<Engine> {
    this.engine ??= this.loadEngine();
    return this.engine;
  }

  /** How large a graph may be, and how long its layout may take, before it is shown as text (spec §9): a settings hook. */
  readonly layoutLimits: LayoutLimits = { ...LAYOUT_LIMITS };

  /** Exports a graph or a view as an image, or its data (spec §16): see export/export.ts. */
  exportGraph(ask: ExportAsk): Promise<ExportOutcome> {
    return exportGraph(this, ask);
  }

  /** The most pixels a PNG export may have here: a larger one is drawn across pages, or refused, with the SVG suggested (spec §16). */
  pngPixelLimit = PNG_PIXEL_LIMIT;

  /** A PNG of an exported SVG at `size` (spec §16): kept apart so a test can stand in one, as it can the engine. */
  rasterise(svg: string, size: PngSize): Promise<Uint8Array> {
    return rasterise(svg, size);
  }

  /** The PNG of an animated image's first frame, or null where it cannot be drawn (§18): apart, so a test can stand in one. */
  stillFrame(bytes: Uint8Array, mime: string): Promise<Uint8Array | null> {
    return stillFrame(bytes, mime);
  }

  /** What a card's images need (§18): the vault's images found from the note at `path`, first frames, and its pictures. */
  cardImages(path: string, pictures: readonly PictureBox[] = []): CardImages {
    return { source: vaultImages(this.app, path), still: (b, m) => this.stillFrame(b, m), pictures };
  }

  private layouts: Layouts | null = null;
  private unloaded = false;

  /**
   * A graph laid out and themed in one worker reused for every block, apart from the interface (§9, layout_contained).
   * Or why it is text only, or null once a newer drawing for its `owner` is asked. Rejects if the engine can't start.
   */
  layout(drawing: GraphDrawing, owner?: object): Promise<Drawn | Refusal | null> {
    // the graph's own direction (§6) or its type's (§15), else the settings' (§21), else the best fit; then as read (§42)
    const laid = this.layoutsOf()?.draw(directed(drawing, this.settings.direction), owner);
    return laid?.then(shownAsRead) ?? Promise.resolve(null);
  }

  /**
   * A graph laid out for an export, in the fixed colours of `theme` (spec §16). It uses the same worker, and the same
   * size and time limits, as a drawing. So an export never holds the page. The result is as `layout`'s.
   */
  layoutForExport(drawing: GraphDrawing, theme: ExportTheme): Promise<Drawn | Refusal | null> {
    return this.layoutsOf()?.draw(drawing, undefined, theme) ?? Promise.resolve(null);
  }

  /** The plugin's layouts, started on first use; none once the plugin is unloaded. */
  private layoutsOf(): Layouts | null {
    if (this.unloaded) return null;
    this.layouts ??= new Layouts(
      () => this.layoutLimits,
      () => this.graphviz(),
    );
    return this.layouts;
  }

  override onunload(): void {
    this.unloaded = true;
    this.layouts?.close();
    this.layouts = null;
  }

  /** The reviews of proposals, by note and proposal: kept while the plugin runs, so a decision can be undone (spec §17). */
  private readonly reviews = new Map<string, ProposalReview>();

  /** The review of the proposal a note's change set holds: the one kept, while the proposal is the same, else `fresh`. */
  reviewOf(path: string, fresh: ProposalReview): ProposalReview {
    const key = `${path}#${fresh.proposal.id}`,
      kept = this.reviews.get(key);
    if (kept && JSON.stringify(kept.proposal) === JSON.stringify(fresh.proposal)) return kept;
    this.reviews.set(key, fresh);
    return fresh;
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

  /** The editors open in place, in drawings' cards: they outlive each redraw of their block (inline-editors.ts). */
  readonly inline = this.addChild(new InlineEditors(this));

  /** Tells `changed` each time an editor in place opens or closes; returns how to stop. */
  watchInline(changed: () => void): () => void {
    return this.inline.watch(changed);
  }

  /** The editor open in place on a note's block whose opening fence is on `line` now, if there is one. */
  inlineFor(path: string, line: number): BlockEditor | undefined {
    return this.inline.find(path, line);
  }

  /** Edit here: opens the block's text in place, inside its drawing's card (spec §4), with the focus in it. */
  editHere(target: EditTarget, slot: HTMLElement): Promise<void> {
    return this.inline.editHere(target, slot);
  }

  /** Opens the edit pane beside the note, on a block (spec §4); one pane, reused. */
  async openEditor(target: EditTarget): Promise<void> {
    const { workspace } = this.app;
    const leaf = workspace.getLeavesOfType(PANE)[0] ?? workspace.getLeaf('split', 'vertical');
    await leaf.setViewState({ type: PANE, state: { ...target }, active: true });
    await workspace.revealLeaf(leaf);
  }
}
