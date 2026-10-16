// The matrix note for Claude's row, read for the gate (spec §26, cc_classified_asks; §19, model_ceiling). Only a note
// whose real path, links settled, is inside the vault's real path is read; anything else is refused with a plain reason
// and gives no rows, so the row clears nothing and both gates (the mod's and the server's) fail closed and say why.
import { matchClass } from '@graph-note/core';
import type { GateSettings } from '@graph-note/core';
import { matrixRows } from '@graph-note/core/hosts/matrix-table';
import { insideVault } from './editor-paths.ts';

/** What reads the note: its text, and its real path when the host can say. */
export interface MatrixReads {
  read: (path: string) => Promise<string>;
  realPath?: (path: string) => Promise<string>;
}

/** `settings` with the matrix rows read from the note it names inside `vault`, or with no rows and why. */
export async function withMatrix(settings: GateSettings, vault: string, reads: MatrixReads): Promise<GateSettings> {
  const refused = (matrixProblem: string): GateSettings => ({ ...settings, matrix: [], matrixProblem });
  const path = insideVault(vault, settings.aiMatrixNote ?? '');
  if (path === null)
    return refused('The matrix note named in the settings is not a path inside the vault, so it is not read.');
  if (!reads.realPath)
    return refused('This host cannot tell whether the matrix note is inside the vault, so it is not read.');
  try {
    const [inVault, inNote] = [await reads.realPath(vault), await reads.realPath(path)];
    const sep = inVault.includes('\\') && !inVault.includes('/') ? '\\' : '/';
    if (!inNote.startsWith(inVault.endsWith(sep) ? inVault : `${inVault}${sep}`))
      return refused('The matrix note is, by its real path, outside the vault, so it is not read.');
  } catch {
    return refused('The real path of the matrix note could not be found, so it is not read.');
  }
  const known = (name: string) => matchClass(name, settings.classifications, settings.aiClassMap ?? {}) !== null;
  try {
    return { ...settings, matrix: matrixRows(await reads.read(path), known) };
  } catch {
    return refused('The matrix note could not be read.');
  }
}
