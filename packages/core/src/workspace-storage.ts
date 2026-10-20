// Notes kept in a VS Code workspace (editor spec §41, storage_contract). They are read and written through the
// workspace's file system, `vscode.workspace.fs`. The VS Code plugin hands it in by path, joined to the workspace
// folder with `Uri.joinPath`, so the core imports no vscode. VS Code's file system keeps no version of its own. So a
// note's version is a hash of its text.
import type { NoteStorage, StoredNote } from './note-storage.ts';
import { memoryStorage } from './note-storage.ts';

// Every runtime the core runs in has these, but the core's own types name none of the web's: only what is used here
declare const TextEncoder: new () => { encode(text: string): Uint8Array };
declare const TextDecoder: new (
  label: string,
  options: { fatal: boolean; ignoreBOM: boolean },
) => { decode(bytes: Uint8Array): string };

/** VS Code's file type for a folder, as `readDirectory` gives it (`FileType.Directory`). */
export const DIRECTORY = 2;

/** The part of `vscode.workspace.fs` the store uses, each by a path inside the workspace folder. */
export interface WorkspaceFiles {
  /** The file's bytes; throws a `FileNotFound` error when there is none. */
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  delete(path: string): Promise<void>;
  /** Each entry of a folder: its name and its file type. `''` is the workspace folder itself. */
  readDirectory(path: string): Promise<[string, number][]>;
  /** Makes a folder and the folders above it. */
  createDirectory(path: string): Promise<void>;
}

/** The notes of a VS Code workspace: not built yet. */
export function workspaceStorage(_files: WorkspaceFiles): NoteStorage {
  return memoryStorage();
}
