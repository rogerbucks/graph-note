// The notes the plug-in reads and writes (editor spec §41, storage_contract). Every note goes through the one storage
// interface, kept in the vault (vault-storage.ts), never through the vault's own reads and writes. So a layer, such as
// encryption or history, plugs in here alone. Files that are not notes, such as an export or an image, are not here.
import type { App } from 'obsidian';
import type { ChangeOutcome, NoteEdit, NoteStorage } from '@thoughtknot/core';
import { changeNote } from '@thoughtknot/core';
import { vaultStorage } from './vault-storage.ts';

/** The vault's notes, read as they are on disk: for a note about to be changed, or one a check reads afresh. */
export const vaultNotes = (app: App): NoteStorage => vaultStorage(app);

/** The vault's notes, read from Obsidian's cache: for a note only shown. */
export const shownNotes = (app: App): NoteStorage => vaultStorage(app, { cached: true });

/** The text of the note at `path`, or null when there is none. With `shown`, read from Obsidian's cache. */
export async function noteText(app: App, path: string, { shown = false } = {}): Promise<string | null> {
  const note = await (shown ? shownNotes(app) : vaultNotes(app)).read(path);
  return note?.text ?? null;
}

/** Changes the note at `path` by `edit`, in one step against the note as it is then (changeNote). */
export const changeVaultNote = (app: App, path: string, edit: NoteEdit): Promise<ChangeOutcome> =>
  changeNote(vaultNotes(app), path, edit);
