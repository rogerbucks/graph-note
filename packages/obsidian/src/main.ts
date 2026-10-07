// Graph Note: draws the graphs written in notes (spec §3), and edits them in a pane beside the note (spec §4).
import { Notice, Plugin, TFile } from 'obsidian';
import type { MarkdownPostProcessorContext } from 'obsidian';
import { gqlBlocks, isSharedSchema, loadEngine } from '@graph-note/core';
import type { Engine } from '@graph-note/core';
import { renderBlock } from './block';
import { GraphPane, PANE } from './pane';
import { addForYou } from './editor';
import { BlockEditor } from './block-editor';

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
}

/** The plugin: draws each graph block, opens the editors, and keeps the drafts and the shared schemas. */
export default class GraphNotePlugin extends Plugin {
  private engine: Promise<Engine> | null = null;
  private saved: Saved = {};
  /** The vault's shared schema blocks, by note: read once, the first time a graph names one, then kept up to date. */
  private schemas: Map<string, string[]> | null = null;

  override async onload(): Promise<void> {
    this.saved = ((await this.loadData()) as Saved | null) ?? {};
    this.registerView(PANE, (leaf) => new GraphPane(leaf, this));
    this.registerEditorExtension(addForYou);
    try {
      this.registerMarkdownCodeBlockProcessor(
        'gql',
        (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => renderBlock(this, source, el, ctx),
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

  drafts(): Drafts {
    return { ...(this.saved.drafts ?? {}) };
  }

  async saveDrafts(drafts: Drafts): Promise<void> {
    this.saved = { ...this.saved, drafts };
    await this.saveData(this.saved);
  }

  /** Starts the Graphviz engine. Kept separate so a test can stand in a failing one. */
  loadEngine(): Promise<Engine> {
    return loadEngine();
  }

  /** The Graphviz engine, started once, the first time a graph is drawn. */
  graphviz(): Promise<Engine> {
    this.engine ??= this.loadEngine();
    return this.engine;
  }

  /** The editors open in place, in drawings' cards: they outlive each redraw of their block. */
  private readonly inline = new Set<BlockEditor>();

  /** The editor open in place on a note's block, by the line of its opening fence, if there is one. */
  inlineFor(path: string, line: number): BlockEditor | undefined {
    return [...this.inline].find((e) => e.path === path && e.session?.ref.line === line);
  }

  /** Edit here: opens the block's text in place, inside its drawing's card (spec §4), with the focus in it. */
  async editHere(target: EditTarget, slot: HTMLElement): Promise<void> {
    let editor = this.inlineFor(target.path, target.line);
    if (!editor) {
      const e = new BlockEditor(this, 'inline');
      e.onDone = () => {
        this.inline.delete(e);
        e.detach();
        this.removeChild(e);
      };
      this.inline.add(e);
      this.addChild(e);
      e.mount(slot);
      await e.open(target.path, target.line);
      editor = e;
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
