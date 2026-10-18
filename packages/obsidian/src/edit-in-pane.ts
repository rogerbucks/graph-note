// Edit on a card whose block is not drawn as a graph of its own (spec §4, own_pane; §20): a block drawn FROM a file or a
// note, and a graph step. As an empty graph's card offers it, Edit opens the block in the pane beside the note. Like
// every control that writes, it is taken away where the card is only read (spec §3). That is reading view, an embed, a
// hover preview, or a card that cannot say which line of which note it is.
import { word } from '@thoughtknot/core';
import type ThoughtKnotPlugin from './main';
import type { EditTarget } from './main';
import { readOnlyHere, whenPlaced } from '@thoughtknot/core/display/graph-view/placement';

/** Puts Edit into `parent`, opening the block at `target` in the pane; none when there is no target. */
export function editInPane(parent: HTMLElement, plugin: ThoughtKnotPlugin, target: EditTarget | null): void {
  if (!target) return;
  const edit = parent.createEl('button', {
    text: word('editor.edit'),
    attr: { 'aria-label': word('editor.edit'), type: 'button' },
  });
  edit.addEventListener('click', () => void plugin.openEditor(target));
  whenPlaced(parent, () => {
    if (readOnlyHere(parent)) edit.remove();
  });
}
