// Nothing the plugin offers in reading view changes the note (spec §3, reading_view_whole_note; Roger, 11 Oct 2026).
// A command that would rewrite a note acts only on the note in the pane in front. It never acts on the one Obsidian last
// had active behind a pane of another kind. It refuses, saying why, while that pane is in reading view or holds no note.
// Another pane showing the same note decides nothing: the pane in front does. An embed is read-only wherever it is shown
// (placement.ts), and an edit pane keeps saving while another pane reads the note (Roger's decision).
import { MarkdownView, Notice } from 'obsidian';
import type { TFile, Workspace } from 'obsidian';

/** Why a command wrote nothing, when the pane in front holds no note. */
const NO_NOTE = 'The pane in front holds no note';

/**
 * For a command about to rewrite the note in the pane in front: that note, when it may go on. Or null, after a notice
 * saying why. That is when the pane in front holds no note (a canvas, a PDF, an empty tab, the edit pane). Or it is when
 * it shows its note in reading view. `to` says what the command does, as in "to convert it".
 */
export function noteToRewrite(workspace: Workspace, to: string): Rewrite | null {
  const view = workspace.getActiveViewOfType(MarkdownView);
  if (!view?.file) {
    new Notice(`${NO_NOTE}: open a note ${to}.`);
    return null;
  }
  if (view.getMode() !== 'preview') return { view, file: view.file };
  new Notice(
    `This note is shown in reading view, which never changes it: switch to Live Preview or Source mode ${to}.`,
  );
  return null;
}

/** The note a command may rewrite, and the pane in front that shows it. */
export interface Rewrite {
  view: MarkdownView;
  file: TFile;
}

/**
 * For a command that took `was` from `noteToRewrite` and has since waited (to read the note). Whether the pane in front
 * is still that view, showing that note, and not in reading view. Else false, after a notice saying why. Asked just
 * before the write, so a pane switched to reading view in between is not written.
 */
export function stillToRewrite(workspace: Workspace, was: Rewrite, to: string): boolean {
  const now = noteToRewrite(workspace, to);
  if (!now) return false;
  if (now.view === was.view && now.file.path === was.file.path) return true;
  new Notice(`The pane in front changed meanwhile, so nothing was written: open the note again ${to}.`);
  return false;
}
