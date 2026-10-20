// Notes kept in a VS Code workspace (editor spec §41, storage_contract). They are read and written through the
// workspace's file system, `vscode.workspace.fs`. The VS Code plugin hands it in by path, joined to the workspace
// folder with `Uri.joinPath`, its bytes read and written as UTF-8. So the core imports no vscode. VS Code's file system keeps no version of its own. So a
// note's version is a hash of its text.
import type { NoteStorage, StoredNote } from './note-storage.ts';
import { notePath, noteVersion, refusal, REFUSED } from './note-storage.ts';

/** VS Code's file type for a folder, as `readDirectory` gives it (`FileType.Directory`). */
export const DIRECTORY = 2;

/** The part of `vscode.workspace.fs` the store uses, each by a path inside the workspace folder. */
export interface WorkspaceFiles {
  /** The file's text, its bytes read as UTF-8 with any byte order mark kept; throws `FileNotFound` when there is none. */
  readText(path: string): Promise<string>;
  /** Writes `text` to the file as UTF-8. */
  writeText(path: string, text: string): Promise<void>;
  delete(path: string): Promise<void>;
  /** Each entry of a folder: its name and its file type. `''` is the workspace folder itself. */
  readDirectory(path: string): Promise<[string, number][]>;
  /** Makes a folder and the folders above it. */
  createDirectory(path: string): Promise<void>;
}

/** Whether an error is VS Code's (or Node's) word that no file is there. */
const notFound = (e: unknown): boolean => {
  const code = (e as { code?: unknown } | null)?.code;
  return code === 'FileNotFound' || code === 'ENOENT' || code === 'EntryNotFound';
};

/** The notes of a VS Code workspace, through its file system. Hidden folders, such as `.vscode` and `.git`, are left out. */
export function workspaceStorage(files: WorkspaceFiles): NoteStorage {
  const at = async (path: string): Promise<StoredNote | null> => {
    try {
      const text = await files.readText(path);
      return { text, version: noteVersion(text) };
    } catch (e) {
      if (notFound(e)) return null;
      throw e;
    }
  };
  const walk = async (folder: string): Promise<string[]> => {
    const found: string[] = [];
    for (const [name, type] of await files.readDirectory(folder)) {
      if (name.startsWith('.')) continue;
      const path = folder ? `${folder}/${name}` : name;
      if (type & DIRECTORY) found.push(...(await walk(path)));
      else if (/\.md$/i.test(name)) found.push(path);
    }
    return found;
  };
  return {
    list: async () => (await walk('')).sort(),
    read: async (path) => at(notePath(path)),
    write: async (path, text, options) => {
      const current = await at(notePath(path));
      const reason = refusal(current, options);
      if (reason) return { ok: false, reason, current };
      const folder = path.slice(0, Math.max(0, path.lastIndexOf('/')));
      if (folder) await files.createDirectory(folder);
      await files.writeText(path, text);
      return { ok: true, version: noteVersion(text) };
    },
    remove: async (path, options) => {
      const current = await at(notePath(path));
      const reason = current ? refusal(current, options) : REFUSED.missing;
      if (reason) return { ok: false, reason, current };
      await files.delete(path);
      return { ok: true, version: null };
    },
  };
}
