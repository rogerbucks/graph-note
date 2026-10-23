// Where the tab's page may reach in the folder (spec §41, vscode_plugin). The page asks for files by a path inside the
// note's folder. These are the same rules the desktop app keeps in Rust (packages/app/src-tauri/src/place.rs):
// - a path never climbs out with `..`, never starts at a root, a drive or the home folder;
// - no part of it is hidden, such as `.git` or `.vscode`;
// - no part of it is a link, so nothing reaches outside through one (`linkFree`).
// A path breaking a rule is refused before the disk is asked anything.

/** VS Code's file type bit for a link (`FileType.SymbolicLink`). */
export const SYMBOLIC_LINK = 64;

/** Why `path` may not be reached, or null when it may. `''` is the folder itself, allowed only where `folder` is true. */
export function placeProblem(path: unknown, { folder = false } = {}): string | null {
  if (typeof path !== 'string') return 'a path must be text';
  if (path === '') return folder ? null : 'a file needs a name';
  if (path.startsWith('/') || path.startsWith('~')) return 'a path starts inside the folder';
  if ([...path].some((c) => c.charCodeAt(0) < 32 || c === '\\' || c === ':' || c === '\u007f'))
    return 'a path holds no backslash, colon or control character';
  for (const part of path.split('/')) {
    if (part === '') return 'a path has no empty part';
    if (part === '.' || part === '..') return 'a path never climbs out of the folder';
    if (part.startsWith('.')) return 'a hidden file or folder is never reached';
  }
  return null;
}

/** Each folder and file on the way to `path`, from the top: `a`, `a/b`, `a/b/c.md`. */
export const stepsTo = (path: string): string[] =>
  path === '' ? [] : path.split('/').map((_, i, parts) => parts.slice(0, i + 1).join('/'));

/**
 * Whether no step on the way to `path` is a link. `typeOf` gives a step's file type, or null when it is not there. A
 * step not there yet is fine: it is made, not followed.
 */
export async function linkFree(path: string, typeOf: (step: string) => Promise<number | null>): Promise<boolean> {
  for (const step of stepsTo(path)) {
    const type = await typeOf(step);
    if (type === null) return true;
    if (type & SYMBOLIC_LINK) return false;
  }
  return true;
}
