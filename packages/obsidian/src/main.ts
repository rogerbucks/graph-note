// Graph Note: draws the graphs written in notes (spec §3), and edits them in a pane beside the note (spec §4).
import { Notice, Plugin } from 'obsidian';
import type { MarkdownPostProcessorContext } from 'obsidian';
import { loadEngine } from '@graph-note/core';
import type { Engine } from '@graph-note/core';
import { renderBlock } from './block';

/** Where Edit was pressed: the note, the line of the block's opening fence (0-based), and the graph it draws. */
export interface EditTarget {
  path: string;
  line: number;
  graph: string;
}

export default class GraphNotePlugin extends Plugin {
  private engine: Promise<Engine> | null = null;

  override async onload(): Promise<void> {
    try {
      this.registerMarkdownCodeBlockProcessor('gql', (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => renderBlock(this, source, el, ctx));
    } catch (e) {
      // Only one plugin may draw a code block language. Say which setting to change, rather than fail quietly.
      console.error('Graph Note could not take gql blocks', e);
      new Notice('Another plugin already draws gql blocks, so graphs cannot be drawn. Update or turn off the gql-highlight plugin, then reload Obsidian.', 0);
    }
    await Promise.resolve();
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

  /** Opens the edit pane on a block. The pane arrives with spec §4; until then this says so. */
  openEditor(target: EditTarget): void {
    new Notice(`The edit pane for graph ${target.graph} is not built yet.`);
  }
}
