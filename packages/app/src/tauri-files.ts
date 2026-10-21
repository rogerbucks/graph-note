// The picked folder's files, through the app's own commands (spec §41, standalone_app). The window reaches the disk
// only through these seven commands, each checked in Rust to stay inside the folder (src-tauri/src/place.rs). They are
// called through Tauri's `invoke`, handed in, so nothing here imports Tauri and the tests hand in their own.
import type { NewFile } from './app-api.ts';
import type { NoteStorage } from '../../core/src/note-storage.ts';
import { DIRECTORY, workspaceStorage, type WorkspaceFiles } from '../../core/src/workspace-storage.ts';

/** Tauri's call into the app: a command by name, with its arguments. It rejects with the command's error text. */
export type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

/** An error the core reads as "no file there" when the command said so (`ENOENT`); any other is kept as it came. */
function asError(e: unknown): Error {
  const said = e instanceof Error ? e.message : String(e);
  return Object.assign(new Error(said), said === 'ENOENT' ? { code: 'ENOENT' } : {});
}

/** The folder's files as the core's workspace storage reads them. */
export function tauriFiles(invoke: Invoke): WorkspaceFiles {
  const call = async <T>(command: string, args: Record<string, unknown>): Promise<T> => {
    try {
      return (await invoke(command, args)) as T;
    } catch (e) {
      throw asError(e);
    }
  };
  return {
    readText: (path) => call<string>('read_text', { path }),
    writeText: (path, text) => call<void>('write_text', { path, text }),
    delete: (path) => call<void>('remove_file', { path }),
    readDirectory: async (path) =>
      (await call<[string, boolean][]>('read_dir', { path })).map(([name, folder]) => [name, folder ? DIRECTORY : 1]),
    createDirectory: (path) => call<void>('make_dir', { path }),
  };
}

/** The notes of the picked folder. */
export const tauriStorage = (invoke: Invoke): NoteStorage => workspaceStorage(tauriFiles(invoke));

/** Writes an export's files as new files in `folder`, never over one (`write_new`); gives the names written. */
export const tauriSaveNew =
  (invoke: Invoke) =>
  async (folder: string, files: NewFile[]): Promise<string[]> =>
    (await invoke('write_new', { into: folder, files: files.map((f) => [f.name, [...f.bytes]]) })) as string[];
