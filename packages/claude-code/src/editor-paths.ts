// The paths `/graph edit` works with (spec §26, workstream C2): a note named from the session's folder, settled to a full
// path, with no Node module: the separator of the session's folder is kept, whichever kind of system it is.

/** Whether a path is a full one, on either kind of system. */
const isFull = (path: string) => /^([\\/]|[A-Za-z]:[\\/])/.test(path);

/** `given` as a full path from `cwd`, with `.` and `..` settled and the separator of `cwd` kept. */
export function fullPath(cwd: string, given: string): string {
  const sep = cwd.includes('\\') && !cwd.includes('/') ? '\\' : '/';
  const full = isFull(given) ? given : `${cwd}${sep}${given}`;
  const drive = /^[A-Za-z]:/.exec(full)?.[0] ?? '';
  const parts: string[] = [];
  for (const part of full.slice(drive.length).split(/[\\/]+/)) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return `${drive}${sep}${parts.join(sep)}`;
}

/** The folder holding a path. */
export function folderOf(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return cut <= 0 ? path.slice(0, 1) : path.slice(0, cut);
}

/** The last part of a path. */
export const nameOf = (path: string): string => path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
