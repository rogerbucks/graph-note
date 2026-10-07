// Graph Note: draws the graphs written in notes (spec §3), and edits them in a pane beside the note (spec §4).
import { Notice, Plugin } from 'obsidian';
import type { MarkdownPostProcessorContext } from 'obsidian';
import { loadEngine } from '@graph-note/core';
import type { Engine } from '@graph-note/core';
import { renderBlock } from './block';
import { GraphPane, PANE } from './pane';

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

export default class GraphNotePlugin extends Plugin {
  private engine: Promise<Engine> | null = null;
  private saved: Saved = {};

  override async onload(): Promise<void> {
    this.saved = ((await this.loadData()) as Saved | null) ?? {};
    this.registerView(PANE, (leaf) => new GraphPane(leaf, this));
    try {
      this.registerMarkdownCodeBlockProcessor('gql', (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => renderBlock(this, source, el, ctx));
    } catch (e) {
      // Only one plugin may draw a code block language. Say which setting to change, rather than fail quietly.
      console.error('Graph Note could not take gql blocks', e);
      new Notice('Another plugin already draws gql blocks, so graphs cannot be drawn. Update or turn off the gql-highlight plugin, then reload Obsidian.', 0);
    }
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

  /** Opens the edit pane beside the note, on a block (spec §4); one pane, reused. */
  async openEditor(target: EditTarget): Promise<void> {
    const { workspace } = this.app;
    const leaf = workspace.getLeavesOfType(PANE)[0] ?? workspace.getLeaf('split', 'vertical');
    await leaf.setViewState({ type: PANE, state: { ...target }, active: true });
    await workspace.revealLeaf(leaf);
  }
}
