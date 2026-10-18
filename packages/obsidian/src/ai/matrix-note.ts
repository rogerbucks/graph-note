// The destination matrix note, read from the vault into plain rows (editor spec §19, model_ceiling).
// - The note named in the settings is read afresh each time, never from a cache.
// - The table in it is read by the core's one reader (`matrixRows`).
// - So Obsidian and the Claude Code mod read a note alike. The gates are handed rows, never a layout.
import type { App } from 'obsidian';
import { matrixRows } from '@thoughtknot/core/hosts/matrix-table';
import type { MatrixRow } from '@thoughtknot/core';

export { matrixRows };

/** The rows of the note named in the settings, read now, never from a cache. None when no note is named or it is not there. */
export async function readMatrix(host: App, path: string, known: (name: string) => boolean): Promise<MatrixRow[]> {
  const file = path.trim() ? host.vault.getFileByPath(path.trim()) : null;
  return file ? matrixRows(await host.vault.read(file), known) : [];
}
