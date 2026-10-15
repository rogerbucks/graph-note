// Writing the block editor's text into its note (spec §4, §9), safely: through the core's session, which never overwrites a
// block changed meanwhile, either through the note's editor when it is open in the editing view or atomically through the
// vault; undo and redo of the note's own changes; and Lock the graph, which writes its schema as a new block (spec §8).
import { Notice } from 'obsidian';
import type { TFile, Vault } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import { gqlSpans, graphOfBlock, insertBlockAfter } from '@graph-note/core';
import type { PaneSession } from '@graph-note/core';

/**
 * A write the note refused, because its block changed meanwhile, or (`edit`) because the note refused an edit made from
 * the drawing (§4): why, and what was typed, to keep as a draft. `history` marks an Undo or Redo with nothing to take
 * back since the block changed outside the editor (§9): only why, as nothing typed needs keeping. `stopped` marks the
 * session stopped by a copy of its block it cannot tell from it, nothing reloaded (block_followed_not_its_copy).
 */
export interface Refused {
  reason: string;
  draft: string;
  edit?: true;
  history?: true;
  stopped?: true;
}

/** The refusal of a write, as the session gave it. */
const refusal = (r: Refused): Refused => ({
  reason: r.reason,
  draft: r.draft,
  ...(r.edit ? { edit: true } : {}),
  ...(r.history ? { history: true } : {}),
  ...(r.stopped ? { stopped: true } : {}),
});

/** Why a write found no note to write into: it was deleted while its block was edited (spec §9). */
export const NOTE_DELETED = 'the note was deleted';

/** Told the note's text as it stands after a write, or as it was found when the write was refused. */
type Keep = (note: string) => void;

/**
 * Writes what is typed into a note open in the editing view, through its editor, as one change of just what differs, never
 * behind its back: Obsidian would apply the file to the editor, and the page would move (§4). Straight through CodeMirror,
 * so neither the editor's own cursor nor its scroll moves: Obsidian's Editor would scroll to that cursor.
 */
export function writeThroughEditor(cm: EditorView, s: PaneSession, keep: Keep): Refused | null {
  const data = cm.state.doc.toString(),
    r = s.write(data);
  if (!r.ok) {
    keep(data);
    return refusal(r);
  }
  let a = 0;
  while (a < data.length && a < r.note.length && data[a] === r.note[a]) a++;
  let b = 0;
  while (b < data.length - a && b < r.note.length - a && data[data.length - 1 - b] === r.note[r.note.length - 1 - b])
    b++;
  cm.dispatch({
    changes: { from: a, to: data.length - b, insert: r.note.slice(a, r.note.length - b) },
    userEvent: 'input.graph-note',
  });
  keep(r.note);
  return null;
}

/** Writes what is typed into a note through the vault, atomically against the note as it is now. */
export async function writeThroughVault(
  vault: Vault,
  file: TFile,
  s: PaneSession,
  keep: Keep,
): Promise<Refused | null> {
  let refused: Refused | null = null;
  await vault.process(file, (data) => {
    const r = s.write(data);
    if (r.ok) {
      keep(r.note);
      return r.note;
    }
    keep(data);
    refused = refusal(r);
    return data;
  });
  return refused;
}

/**
 * Undo or Redo of the session's changes to the note, through the vault; refused, never over a change made outside the
 * editor (§9); a refused write keeps the note as it was found.
 */
export async function stepNote(
  vault: Vault,
  file: TFile,
  s: PaneSession,
  which: 'undo' | 'redo',
  keep: Keep,
): Promise<Refused | null> {
  let refused: Refused | null = null;
  await vault.process(file, (data) => {
    const r = which === 'undo' ? s.undo(data) : s.redo(data);
    if (r.ok) {
      keep(r.note);
      return r.note;
    }
    // a refused write took the note as found; Undo or Redo with nothing to take back did not, so a change in it is
    // still heard when the vault tells of it
    if (!r.history) keep(data);
    refused = refusal(r);
    return data;
  });
  return refused;
}

/** Lock the graph: writes its schema `block` after the graph's last block in the note, or says it could not. */
export async function lockInNote(vault: Vault, file: TFile, graph: string, block: string, keep: Keep): Promise<void> {
  await vault.process(file, (data) => {
    const last = gqlSpans(data)
      .filter((x) => graphOfBlock(x.text) === graph)
      .pop();
    const r = last ? insertBlockAfter(data, { line: last.open, text: last.text }, block) : null;
    if (!r?.ok) {
      new Notice('The graph could not be locked: its block changed. Try again.');
      return data;
    }
    keep(r.note);
    return r.note;
  });
}
