// Writing the block editor's text into its note (spec §4, §9), safely.
// - It goes through the core's session, which never overwrites a block changed meanwhile. The write goes through the
//   note's editor when it is open in the editing view. Otherwise it goes atomically through the vault's
//   note storage (storage_contract).
// - Undo and redo of the note's own changes.
// - Lock the graph, which writes its schema as a new block (spec §8).
import { Notice } from 'obsidian';
import type { App, TFile } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import type { PaneSession } from '@thoughtknot/core';
import type { Refused } from '@thoughtknot/core/display/editor/editor-note';
import { lockFailed, lockedNote } from '@thoughtknot/core/display/editor/lock-text';
import { changeVaultNote } from '../storage/plugin-notes';

export type { Refused };

/** The refusal of a write, as the session gave it. */
const refusal = (r: Refused): Refused => ({
  reason: r.reason,
  draft: r.draft,
  ...(r.edit ? { edit: true } : {}),
  ...(r.history ? { history: true } : {}),
  ...(r.stopped ? { stopped: true } : {}),
});

/** Told the note's text as it stands after a write, or as it was found when the write was refused. */
type Keep = (note: string) => void;

/**
 * Writes what is typed into a note open in the editing view, through its editor. It is one change of just what differs.
 * Never behind its back: Obsidian would apply the file to the editor, and the page would move (§4). Straight through CodeMirror,
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
    userEvent: 'input.thoughtknot',
  });
  keep(r.note);
  return null;
}

/** Writes what is typed into a note through the vault, atomically against the note as it is now. */
export async function writeThroughVault(app: App, file: TFile, s: PaneSession, keep: Keep): Promise<Refused | null> {
  let refused: Refused | null = null;
  await changeVaultNote(app, file.path, (data) => {
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
 * Undo or Redo of the session's changes to the note, through the vault. It is refused, never written over a change made
 * outside the editor (§9). A refused write keeps the note as it was found.
 */
export async function stepNote(
  app: App,
  file: TFile,
  s: PaneSession,
  which: 'undo' | 'redo',
  keep: Keep,
): Promise<Refused | null> {
  let refused: Refused | null = null;
  await changeVaultNote(app, file.path, (data) => {
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
export async function lockInNote(app: App, file: TFile, graph: string, block: string, keep: Keep): Promise<void> {
  await changeVaultNote(app, file.path, (data) => {
    const locked = lockedNote(data, graph, block);
    if (locked === null) {
      new Notice(lockFailed());
      return data;
    }
    keep(locked);
    return locked;
  });
}
