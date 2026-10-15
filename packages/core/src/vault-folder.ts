// The folder exports are saved in, as the settings keep it (spec §16, §21): only a folder inside the vault, written the
// same way on every platform. Moved out of settings.ts unchanged, which re-exports it.
const UNSAFE_IN_A_FOLDER = '\\:*?"<>|';

/**
 * A folder inside the vault as the settings keep it: trimmed, with empty parts dropped (`a//b/` is `a/b`), or null when it
 * could reach outside the vault, reach the config folder, or cannot be a folder name on every platform — a leading `/` or
 * `~`, a part that starts with a dot (so `.`, `..` and `.obsidian`), a part that ends in a dot or a space, a name Windows
 * reserves (con, prn, aux, nul, com1–9, lpt1–9), a backslash, a colon, any of `*?"<>|`, or a control character. Empty is
 * next to the note.
 */
export function vaultFolder(given: unknown): string | null {
  const folder = typeof given === 'string' ? given.trim() : '';
  if (!folder) return '';
  if (folder.startsWith('/') || folder.startsWith('~')) return null;
  if ([...folder].some((c) => c.charCodeAt(0) < 32 || UNSAFE_IN_A_FOLDER.includes(c))) return null;
  const parts = folder.split('/').filter((p) => p !== '');
  return parts.some(unusablePart) ? null : parts.join('/');
}

// names Windows keeps for devices, whatever follows a dot: con.txt is con
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Whether a folder name cannot be used for exports: it starts with a dot (so `.`, `..` and the config folder are out),
 * ends in a dot or a space, or is a name Windows reserves.
 */
function unusablePart(part: string): boolean {
  return part.startsWith('.') || part.endsWith('.') || part.endsWith(' ') || RESERVED.test(part.split('.')[0] ?? '');
}
