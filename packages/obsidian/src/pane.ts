// The edit pane (spec §4, §9): a view beside the note, on one graph block — the block editor, with its own drawing, a picker
// of the note's graph blocks, and on a phone Drawing and Text as two tabs.
import { ItemView } from 'obsidian';
import type { ViewStateResult, WorkspaceLeaf } from 'obsidian';
import type GraphNotePlugin from './main';
import type { EditTarget } from './main';
import { BlockEditor } from './block-editor';

export const PANE = 'graph-note-pane';

export class GraphPane extends ItemView {
  private readonly editor: BlockEditor;

  constructor(leaf: WorkspaceLeaf, plugin: GraphNotePlugin) {
    super(leaf);
    this.editor = new BlockEditor(plugin, 'pane');
  }

  getViewType(): string { return PANE; }
  getDisplayText(): string { return this.editor.session ? `Graph ${this.editor.session.graph}` : 'Graph'; }
  override getIcon(): string { return 'git-fork'; }

  override getState(): Record<string, unknown> {
    return { path: this.editor.path, line: this.editor.session?.ref.line ?? 0, graph: this.editor.session?.graph ?? '' };
  }

  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const t = state as Partial<EditTarget>;
    if (typeof t.path === 'string') {
      this.editor.mount(this.contentEl);
      await this.editor.open(t.path, t.line ?? 0);
    }
    await super.setState(state, result);
  }

  override async onOpen(): Promise<void> {
    this.addChild(this.editor);
    await Promise.resolve();
  }

  override async onClose(): Promise<void> {
    await this.editor.flush();
  }
}
