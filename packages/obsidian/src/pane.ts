// The edit pane (spec §4, §9): a view beside the note, on one graph block — the block editor, with its own drawing, a picker
// of the note's graph blocks, and on a phone Drawing and Text as two tabs.
import { ItemView } from 'obsidian';
import type { ViewStateResult, WorkspaceLeaf } from 'obsidian';
import type ThoughtknotPlugin from './main';
import type { EditTarget } from './main';
import { BlockEditor } from './block-editor/block-editor';
import { word } from '@thoughtknot/core';

/** The edit pane's view type. */
export const PANE = 'thoughtknot-pane';

/** The edit pane: a view beside the note, holding the block editor. */
export class GraphPane extends ItemView {
  private readonly editor: BlockEditor;

  constructor(leaf: WorkspaceLeaf, plugin: ThoughtknotPlugin) {
    super(leaf);
    this.editor = new BlockEditor(plugin, 'pane');
    // a setting that changes how the text is read or drawn: read again at once (spec §21)
    this.register(plugin.watchSettings(() => this.editor.changed()));
  }

  getViewType(): string {
    return PANE;
  }
  getDisplayText(): string {
    return this.editor.session ? word('bar.name', { graph: this.editor.session.graph }) : word('editor.pane-title');
  }
  override getIcon(): string {
    return 'git-fork';
  }

  override getState(): Record<string, unknown> {
    return {
      path: this.editor.path,
      line: this.editor.session?.ref.line ?? 0,
      graph: this.editor.session?.graph ?? '',
    };
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
