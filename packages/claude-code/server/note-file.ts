// A note's file read and written (spec §26, cc_atomic_write, cc_write_if_unchanged): read whole within the core's read
// limit for a note, never through a link at its last step, as UTF-8 that must decode exactly, with its version the
// SHA-256 of its bytes; written to a new temporary file beside it, flushed to the disk, then renamed into place, so the
// note on disk is always the old one whole or the new one whole. On any failure the temporary file is removed.
import { createHash, randomBytes } from 'node:crypto';
import { constants, promises as fs } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { BODY_LIMIT } from './request-body.ts';

/** The file operations a write is made of; the tests hand in their own to hold or break one step. */
export interface NoteFiles {
  /** Makes `temp`, which must not exist yet, holding `text` with `mode`, flushed to the disk before it resolves. */
  writeTemp(temp: string, text: string, mode: number): Promise<void>;
  /** Moves `from` over `to`, whole or not at all, and flushes the folder. */
  rename(from: string, to: string): Promise<void>;
  /** Removes `path`; one that is not there is not an error. */
  remove(path: string): Promise<void>;
}

/** Node's own file operations. */
export const NODE_FILES: NoteFiles = {
  async writeTemp(temp, text, mode) {
    const file = await fs.open(temp, 'wx', mode);
    try {
      // the umask narrows the mode `open` makes a file with; the note's own is put back whole
      await file.chmod(mode);
      await file.writeFile(text, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
  },
  async rename(from, to) {
    await fs.rename(from, to);
    // the rename itself made lasting; a system that cannot flush a folder still has the note whole
    const folder = await fs.open(dirname(to), 'r').catch(() => null);
    if (!folder) return;
    await folder.sync().catch(() => {});
    await folder.close();
  },
  async remove(path) {
    await fs.rm(path, { force: true });
  },
};

/** A note's text as read, and its version. */
export type NoteText = { ok: true; text: string; version: string; mode: number } | { ok: false; why: string };

/** The version of a note: the SHA-256 of its bytes, quoted as an ETag. */
export function versionOf(bytes: Uint8Array | string): string {
  return `"${createHash('sha256').update(bytes).digest('hex')}"`;
}

const DECODER = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** The note at `real` (a real path, checked), read whole; or why not. */
export async function readNoteFile(real: string): Promise<NoteText> {
  let file: fs.FileHandle;
  try {
    file = await fs.open(real, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    return { ok: false, why: 'The note is no longer there.' };
  }
  try {
    const stat = await file.stat();
    if (!stat.isFile()) return { ok: false, why: 'The note is no longer a file.' };
    // the path still leads nowhere but itself, so no folder swapped for a link since it was checked is read through
    // (`lstat` alone follows such a folder as `open` did); then the file opened is the one at the path now
    if ((await fs.realpath(real).catch(() => null)) !== real)
      return { ok: false, why: 'The note’s folder was moved or replaced.' };
    const there = await fs.lstat(real).catch(() => null);
    if (!there || there.dev !== stat.dev || there.ino !== stat.ino)
      return { ok: false, why: 'The note changed place while it was read.' };
    if (stat.size > BODY_LIMIT)
      return { ok: false, why: `The note is larger than a note may be: ${BODY_LIMIT} bytes.` };
    const bytes = new Uint8Array(await file.readFile());
    if (bytes.length > BODY_LIMIT)
      return { ok: false, why: `The note is larger than a note may be: ${BODY_LIMIT} bytes.` };
    let text: string;
    try {
      text = DECODER.decode(bytes);
    } catch {
      return { ok: false, why: 'The note is not UTF-8 text.' };
    }
    return { ok: true, text, version: versionOf(bytes), mode: stat.mode & 0o777 };
  } finally {
    await file.close();
  }
}

const CAUSES: Record<string, string> = {
  ENOSPC: 'the disk is full',
  EDQUOT: 'the disk is full',
  EACCES: 'permission was refused',
  EPERM: 'permission was refused',
  EROFS: 'the folder cannot be written to',
  ENOENT: 'the folder is not there',
  EBUSY: 'the file is in use by another program',
};

/** Why a write failed, in words that complete "could not be written: …". */
function causeOf(e: unknown): string {
  const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : '';
  return CAUSES[code] ?? 'the system gave no reason it can say';
}

/** The refusal of a rename whose folder is no longer the one checked. */
const FOLDER_MOVED = 'folder moved';

/** A temporary name beside `target`, hidden, so the vault's own app passes it by. */
export function tempBeside(target: string): string {
  return join(dirname(target), `.${basename(target)}.${randomBytes(6).toString('hex')}.thoughtknot`);
}

/** Writes `text` to `target` by way of a new file beside it; the result is the new version, or why nothing changed. */
export async function writeAtomically(
  target: string,
  text: string,
  mode: number,
  files: NoteFiles,
): Promise<{ ok: true; version: string } | { ok: false; why: string }> {
  const temp = tempBeside(target);
  try {
    await files.writeTemp(temp, text, mode);
    // the folder is still the one checked: one swapped for a link meanwhile would carry the rename out of the vault
    if ((await fs.realpath(dirname(temp)).catch(() => null)) !== dirname(target)) throw new Error(FOLDER_MOVED);
    await files.rename(temp, target);
    return { ok: true, version: versionOf(text) };
  } catch (e) {
    await files.remove(temp).catch(() => {});
    const cause = e instanceof Error && e.message === FOLDER_MOVED ? 'its folder was moved or replaced' : causeOf(e);
    return { ok: false, why: `It could not be written: ${cause}. The note is as it was.` };
  }
}
