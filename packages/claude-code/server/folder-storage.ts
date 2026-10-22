// Notes kept in a plain folder (editor spec §41, storage_contract), as the browser editor and the standalone app keep
// them. A note is read whole, as UTF-8, and never through a link. It is written to a new file beside it, then renamed
// into place. So the note on disk is always the old one whole or the new one whole (note-file.ts). Its version is the
// SHA-256 of its bytes. Hidden folders, such as `.obsidian` and `.git`, are left out.
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import type { NoteStorage, StoredNote } from '@thoughtknot/core';
import { notePath, refusal, REFUSED } from '@thoughtknot/core';
import { NODE_FILES, readNoteFile, writeAtomically } from './note-file.ts';
import type { NoteFiles } from './note-file.ts';

/** A read or write that failed, naming the note, with why in words of its own for a host to show (`why`). */
const fault = (path: string, why: string) => Object.assign(new Error(`${path}: ${why}`), { why });

/** Why a read or write of the store failed, in words for the person: the store's own, or the error's. */
export const faultOf = (e: unknown): string =>
  e && typeof e === 'object' && 'why' in e ? String(e.why) : e instanceof Error ? e.message : String(e);

/** A new note's mode: read and written by its owner, read by others, as a text editor makes one. */
const NEW_NOTE_MODE = 0o644;

/** The notes of the folder at `root`, which must be a real path: no link anywhere along it. */
export function folderStorage(root: string, files: NoteFiles = NODE_FILES): NoteStorage {
  const real = (path: string) => join(root, ...path.split('/'));
  const at = async (path: string): Promise<(StoredNote & { mode: number }) | null> => {
    const there = await fs.lstat(real(path)).catch(() => null);
    if (!there) return null;
    const read = await readNoteFile(real(path));
    if (!read.ok) throw fault(path, read.why);
    return { text: read.text, version: read.version, mode: read.mode };
  };
  const walk = async (folder: string): Promise<string[]> => {
    const found: string[] = [];
    const entries = await fs.readdir(folder ? real(folder) : root, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const path = folder ? `${folder}/${entry.name}` : entry.name;
      if (entry.isDirectory()) found.push(...(await walk(path)));
      else if (entry.isFile() && /\.md$/i.test(entry.name)) found.push(path);
    }
    return found;
  };
  /** A note without its mode, as the store gives it. */
  const shown = (note: (StoredNote & { mode: number }) | null): StoredNote | null =>
    note && { text: note.text, version: note.version };
  return {
    list: async () => (await walk('')).sort(),
    read: async (path) => shown(await at(notePath(path))),
    write: async (path, text, options) => {
      const current = await at(notePath(path));
      const reason = refusal(shown(current), options);
      if (reason) return { ok: false, reason, current: shown(current) };
      await fs.mkdir(dirname(real(path)), { recursive: true });
      const done = await writeAtomically(real(path), text, current?.mode ?? NEW_NOTE_MODE, files);
      if (!done.ok) throw fault(path, done.why);
      return { ok: true, version: done.version };
    },
    remove: async (path, options) => {
      const current = shown(await at(notePath(path)));
      const reason = current ? refusal(current, options) : REFUSED.missing;
      if (reason) return { ok: false, reason, current };
      await files.remove(real(path));
      return { ok: true, version: null };
    },
  };
}
