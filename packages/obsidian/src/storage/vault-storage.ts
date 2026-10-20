// Notes kept in an Obsidian vault (editor spec §41, storage_contract). They go through the vault's own API, never the
// file system. So Obsidian sees every change, as its guidelines ask. A write checks the version it was made against
// inside `vault.process`, which reads and writes in one step. So a change made in between is never written over.
import type { App } from 'obsidian';
import type { NoteStorage, StoredNote, WriteOutcome } from '@thoughtknot/core';
import { notePath, noteVersion, refusal, REFUSED } from '@thoughtknot/core';

/**
 * The notes of the app's vault. Its config folder and other hidden folders are left out, as their paths are not notes.
 * A note removed goes where the person's deleted files go, as their setting says.
 */
export function vaultStorage({ vault, fileManager }: App): NoteStorage {
  const at = async (path: string): Promise<StoredNote | null> => {
    const file = vault.getFileByPath(path);
    if (!file) return null;
    const text = await vault.read(file);
    return { text, version: noteVersion(text) };
  };
  return {
    list: async () =>
      vault
        .getMarkdownFiles()
        .map((f) => f.path)
        .filter((path) => !path.split('/').some((part) => part.startsWith('.')))
        .sort(),
    read: async (path) => at(notePath(path)),
    write: async (path, text, options) => {
      const file = vault.getFileByPath(notePath(path));
      if (!file) {
        const reason = refusal(null, options);
        if (reason) return { ok: false, reason, current: null };
        const folder = path.slice(0, Math.max(0, path.lastIndexOf('/')));
        if (folder && !vault.getFolderByPath(folder)) await vault.createFolder(folder);
        await vault.create(path, text);
        return { ok: true, version: noteVersion(text) };
      }
      let outcome: WriteOutcome = { ok: true, version: noteVersion(text) };
      await vault.process(file, (was) => {
        const current = { text: was, version: noteVersion(was) };
        const reason = refusal(current, options);
        if (!reason) return text;
        outcome = { ok: false, reason, current };
        return was;
      });
      return outcome;
    },
    remove: async (path, options) => {
      const current = await at(notePath(path));
      const reason = current ? refusal(current, options) : REFUSED.missing;
      if (reason) return { ok: false, reason, current };
      const file = vault.getFileByPath(path);
      if (file) await fileManager.trashFile(file);
      return { ok: true, version: null };
    },
  };
}
