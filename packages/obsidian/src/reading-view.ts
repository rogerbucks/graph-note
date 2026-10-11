// A note shown in reading view is never changed by the plugin (spec §3, reading_view_whole_note; Roger, 11 Oct 2026): a
// command that would rewrite the note in front asks here first, and refuses, saying why and what to do, while that note
// is shown in reading view. One place decides it, from the mode of the view in front, so every such command agrees.
import { MarkdownView, Notice } from 'obsidian';
import type { Workspace } from 'obsidian';

/** Whether the note in front is shown in reading view, rather than in Live Preview or Source mode. */
export const shownInReadingView = (workspace: Workspace): boolean =>
  workspace.getActiveViewOfType(MarkdownView)?.getMode() === 'preview';

/**
 * For a command about to rewrite the note in front: true, after a notice saying why and what to do, when the note is shown
 * in reading view, so the command writes nothing; false when it may go on. `to` says what the command does, as in "to
 * convert it".
 */
export function refusedInReadingView(workspace: Workspace, to: string): boolean {
  if (!shownInReadingView(workspace)) return false;
  new Notice(
    `This note is shown in reading view, which never changes it: switch to Live Preview or Source mode ${to}.`,
  );
  return true;
}
