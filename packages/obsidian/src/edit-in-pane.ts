// Edit on a card whose block is not drawn as a graph of its own (spec §4, own_pane; §20): a block drawn FROM a file or a
// note, and a graph step. As an empty graph's card offers it, Edit opens the block in the pane beside the note; and, as
// every control that writes, it is taken away where the card is only read (spec §3): reading view, an embed, a hover
// preview, or a card that cannot say which line of which note it is.
import type GraphNotePlugin from './main';
import type { EditTarget } from './main';
import { readOnlyHere, whenPlaced } from './graph-view/placement';

/** Puts Edit into `parent`, opening the block at `target` in the pane; none when there is no target. */
export function editInPane(parent: HTMLElement, plugin: GraphNotePlugin, target: EditTarget | null): void {
  if (!target) return;
  const edit = parent.createEl('button', { text: 'Edit', attr: { 'aria-label': 'Edit', type: 'button' } });
  edit.addEventListener('click', () => void plugin.openEditor(target));
  whenPlaced(parent, () => {
    if (readOnlyHere(parent)) edit.remove();
  });
}
