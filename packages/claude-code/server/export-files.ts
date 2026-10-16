// Writing an export (spec §26, cc_exports_new_only): the files the page made, put into the export folder as new files and
// nothing else. The folder is made, a folder part at a time, only where it is not there, and every part must be a real
// folder inside the vault, never a link (a link is never followed, so none can lead out), with the folder's real path
// checked to be the one expected before each try. A file is opened to be created and no more: exclusively (`O_EXCL`),
// never through a link (`O_NOFOLLOW`), never truncating or appending, so a file already there, a link among them, is
// never written to. A name already taken gives the next number, the same for every file of the export; a name is only a
// name. All of the files or none: one that cannot be written takes away those made before it.
import { constants, promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { join } from 'node:path';

/** The file operations an export is made of; Node's own unless a test hands in its own to break one. */
export interface ExportFs {
  open(path: string, flags: number, mode: number): Promise<FileHandle>;
  lstat(path: string): Promise<{ isDirectory(): boolean; isSymbolicLink(): boolean }>;
  mkdir(path: string, options: { mode: number }): Promise<unknown>;
  realpath(path: string): Promise<string>;
  unlink(path: string): Promise<void>;
}

export const NODE_EXPORT_FS: ExportFs = {
  open: (path, flags, mode) => fs.open(path, flags, mode),
  lstat: (path) => fs.lstat(path),
  mkdir: (path, options) => fs.mkdir(path, options),
  realpath: (path) => fs.realpath(path),
  unlink: (path) => fs.unlink(path),
};

/** A file to be made: its name alone and its bytes. */
export interface NewFile {
  name: string;
  bytes: Uint8Array;
}

/** The names written, or why nothing was, with the status to answer it with. */
export type Made = { ok: true; names: string[] } | { ok: false; status: number; why: string };

/** The endings an export has: the images, the data, and a companion note. */
export const ENDINGS = ['svg', 'png', 'gql', 'csv', 'graphml', 'md'] as const;

/** The most bytes of a name: file systems count 255, and a number is added on a clash. */
const NAME_BYTES = 240;

/** The most numbers tried for a name taken. */
const MOST_NUMBERS = 1000;

const UNSAFE = '/\\:*?"<>|';

/** Why `name` is not a file name an export may have, or null: only a name, never a path, with an ending of an export's. */
export function nameProblem(name: unknown): string | null {
  if (typeof name !== 'string' || name === '') return 'A file needs a name.';
  const shown = JSON.stringify(name).slice(0, 60);
  if (Buffer.byteLength(name) > NAME_BYTES) return `${shown} is too long for a file name.`;
  if ([...name].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || UNSAFE.includes(c)))
    return `${shown} is more than a name: a file name has no separator, control character or any of ${UNSAFE}.`;
  if (name.includes('..') || name.startsWith('.') || name.endsWith('.') || name.endsWith(' '))
    return `${shown} is not a name an export may have: no .., no leading dot, no trailing dot or space.`;
  const dot = name.lastIndexOf('.');
  if (dot < 1 || !(ENDINGS as readonly string[]).includes(name.slice(dot + 1)))
    return `${shown} does not end in one of ${ENDINGS.map((e) => `.${e}`).join(', ')}.`;
  return null;
}

/** `name` with `n` before its ending: `plan.svg` is `plan-2.svg`. */
export const numbered = (name: string, n: number): string => {
  const dot = name.lastIndexOf('.');
  return `${name.slice(0, dot)}-${n}${name.slice(dot)}`;
};

const CAUSES: Record<string, string> = {
  ENOSPC: 'the disk is full',
  EACCES: 'permission was refused',
  EPERM: 'permission was refused',
  EROFS: 'the folder cannot be written to',
  ENAMETOOLONG: 'the file name is too long',
  EMFILE: 'too many files are open',
};

const codeOf = (e: unknown): string => (e && typeof e === 'object' && 'code' in e ? String(e.code) : '');

const failed = (e: unknown): Made => ({
  ok: false,
  status: 500,
  why: `The export could not be written: ${CAUSES[codeOf(e)] ?? (e instanceof Error ? e.message : 'it failed')}. Nothing was saved.`,
});

const refused = (why: string): Made => ({ ok: false, status: 403, why });

/** The real path of the export folder `folder` (parts joined by `/`) inside `vault`, made where missing; or why not. */
async function exportDirectory(vault: string, folder: string, ops: ExportFs): Promise<{ dir: string } | Made> {
  const parts = folder.split('/').filter((p) => p !== '');
  if (parts.some((p) => p.startsWith('.') || p.includes('\0') || p.includes('\\')))
    return refused('The export folder is, or is in, a hidden folder, which an export never uses.');
  let at = vault;
  for (const part of parts) {
    at = join(at, part);
    let stat = await ops.lstat(at).catch((e: unknown) => (codeOf(e) === 'ENOENT' ? null : e));
    if (stat instanceof Error) return failed(stat);
    if (stat === null) {
      await ops.mkdir(at, { mode: 0o755 }).catch((e: unknown) => {
        if (codeOf(e) !== 'EEXIST') throw e;
      });
      stat = await ops.lstat(at);
    }
    const found = stat as { isDirectory(): boolean; isSymbolicLink(): boolean };
    if (found.isSymbolicLink())
      return refused(`${part} in the export folder is a link, and a link is never followed. Nothing was saved.`);
    if (!found.isDirectory())
      return refused(`${part} in the export folder is a file, not a folder. Nothing was saved.`);
  }
  const expected = join(vault, ...parts);
  if ((await ops.realpath(expected)) !== expected)
    return refused('The export folder leads outside the vault, so nothing was saved.');
  return { dir: expected };
}

/** Whether something, a link or a file, is at `path`. */
async function taken(ops: ExportFs, path: string): Promise<boolean> {
  try {
    await ops.lstat(path);
    return true;
  } catch (e) {
    if (codeOf(e) === 'ENOENT') return false;
    throw e;
  }
}

/** Takes away the files this attempt made, which it alone made (exclusively): none stays if the export does not. */
async function takenAway(ops: ExportFs, paths: string[]): Promise<void> {
  for (const path of paths) await ops.unlink(path).catch(() => {});
}

const CREATE = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;

/** Makes every file at `paths`, new: `clash` when one is there by now, which leaves none made by this attempt. */
async function makeAll(ops: ExportFs, paths: string[], files: NewFile[]): Promise<'made' | 'clash' | Made> {
  const made: string[] = [];
  try {
    for (const [i, path] of paths.entries()) {
      const bytes = files[i]?.bytes ?? new Uint8Array();
      let handle: FileHandle;
      try {
        handle = await ops.open(path, CREATE, 0o644);
      } catch (e) {
        await takenAway(ops, made);
        return codeOf(e) === 'EEXIST' ? 'clash' : failed(e);
      }
      made.push(path);
      try {
        for (let done = 0; done < bytes.length;)
          done += (await handle.write(bytes, done, bytes.length - done, done)).bytesWritten;
        await handle.sync();
      } finally {
        await handle.close();
      }
    }
    return 'made';
  } catch (e) {
    await takenAway(ops, made);
    return failed(e);
  }
}

/**
 * Writes `files` as new files in the export folder `folder` of `vault` (its real path), under their names or, when any of
 * the names is taken, all of them under the first number that is free for every one. Never over a file already there.
 */
export async function writeNewFiles(
  vault: string,
  folder: string,
  files: NewFile[],
  ops: ExportFs = NODE_EXPORT_FS,
): Promise<Made> {
  try {
    for (let n = 1; n <= MOST_NUMBERS; n++) {
      // the folder is checked again before every try: a folder swapped for a link in between is not written into
      const where = await exportDirectory(vault, folder, ops);
      if (!('dir' in where)) return where;
      const names = files.map((f) => (n === 1 ? f.name : numbered(f.name, n)));
      const paths = names.map((name) => join(where.dir, name));
      let busy = false;
      for (const path of paths) busy = busy || (await taken(ops, path));
      if (busy) continue;
      const result = await makeAll(ops, paths, files);
      if (result === 'clash') continue;
      return result === 'made' ? { ok: true, names } : result;
    }
    return {
      ok: false,
      status: 409,
      why: `Earlier exports hold the first ${MOST_NUMBERS} numbers of these names, so nothing was saved. Move some away.`,
    };
  } catch (e) {
    return failed(e);
  }
}
