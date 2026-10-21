// The matrix note for Claude's row, read for the gate (spec §26, cc_classified_asks; §19, model_ceiling). Only a note
// whose real path, links settled, is inside the vault's real path is read. Anything else is refused with a plain
// reason, and gives no rows. So the row clears nothing, and both gates (the mod's and the server's) fail closed and say
// why.
import { matchClass, word } from '@thoughtknot/core';
import type { GateSettings } from '@thoughtknot/core';
import { matrixRows } from '@thoughtknot/core/hosts/matrix-table';
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
  if (path === null) return refused(word('cc.matrix.outside-settings'));
  if (!reads.realPath) return refused(word('cc.matrix.cannot-tell'));
  try {
    const [inVault, inNote] = [await reads.realPath(vault), await reads.realPath(path)];
    const sep = inVault.includes('\\') && !inVault.includes('/') ? '\\' : '/';
    if (!inNote.startsWith(inVault.endsWith(sep) ? inVault : `${inVault}${sep}`))
      return refused(word('cc.matrix.outside-real'));
  } catch {
    return refused(word('cc.matrix.no-real-path'));
  }
  const known = (name: string) => matchClass(name, settings.classifications, settings.aiClassMap ?? {}) !== null;
  try {
    return { ...settings, matrix: matrixRows(await reads.read(path), known) };
  } catch {
    return refused(word('cc.matrix.unreadable'));
  }
}
