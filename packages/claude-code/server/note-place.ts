// Where a note may be (spec §26, cc_no_escape): inside the vault, a .md file, in no hidden folder, and never reached by
// a symlink that leads out of the vault. The path is checked as written and again as its real path, every link
// followed, so neither `..` nor a link can leave the vault. The note store checks a note's place when it is opened and
// again before every read and write, so a note swapped for a link after it was opened is refused too.
import { promises as fs } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

/** Where a note is: its real path and its path inside the vault; or why it may not be opened. */
export type Place = { ok: true; real: string; inVault: string } | { ok: false; why: string };

/** The vault: its real path, and the path it was named by, through which a full path to a note may come. */
export interface Vault {
  real: string;
  named: string;
}

/** The path of `full` inside `root`, or null when it is not inside it (the root itself is not inside). */
export function inside(root: string, full: string): string | null {
  const rel = relative(root, full);
  return rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel) ? null : rel;
}

/** Why a path inside the vault may not be a note's, or null: a hidden folder or file, or not Markdown. */
function refusal(inVault: string, given: string, linked: boolean): string | null {
  const parts = inVault.split(/[\\/]/);
  if (parts.some((p) => p.startsWith('.')))
    return `${given} ${linked ? 'leads into' : 'is in'} a hidden folder or file, which the editor never opens.`;
  if (!inVault.endsWith('.md'))
    return `${given} ${linked ? 'leads to a file that is' : 'is'} not a Markdown note (.md).`;
  return null;
}

/** Where the note `given` (a path inside the vault, or a full one) is, or why it may not be opened. */
export async function notePlace(vault: Vault, given: string): Promise<Place> {
  if (typeof given !== 'string' || given === '' || given.includes('\0'))
    return { ok: false, why: 'That is not a note’s path.' };
  const named = isAbsolute(given) ? resolve(given) : resolve(vault.real, given);
  const written = inside(vault.real, named) ?? inside(vault.named, named);
  if (written === null) return { ok: false, why: `${given} is outside the vault.` };
  const asWritten = refusal(written, given, false);
  if (asWritten) return { ok: false, why: asWritten };
  let real: string;
  try {
    real = await fs.realpath(named);
  } catch {
    return { ok: false, why: `${given} is not there.` };
  }
  const inVault = inside(vault.real, real);
  if (inVault === null) return { ok: false, why: `${given} leads outside the vault.` };
  const asLinked = refusal(inVault, given, true);
  if (asLinked) return { ok: false, why: asLinked };
  const stat = await fs.stat(real).catch(() => null);
  if (!stat?.isFile()) return { ok: false, why: `${given} is not a file.` };
  return { ok: true, real, inVault };
}
