// Writing an export safely (editor spec §16, failed_export): the bytes are written to a temporary file and only then renamed
// into place, so the target is never left half written; on any failure the temporary file is removed and the reason is
// said in a sentence, for the editor to show. The core knows no file system: the host gives the three operations, and the
// rename must put the whole file in place or leave the target as it was.

/** The file operations the host gives. Each may throw, or reject, with an error that may carry a `code` such as `ENOSPC`. */
export interface WriteOps {
  /** Writes `bytes` to `path`, making the file or replacing it. */
  write(path: string, bytes: Uint8Array | string): Promise<void>;
  /** Moves `from` to `to`, replacing what is at `to`: whole, or not at all. */
  rename(from: string, to: string): Promise<void>;
  /** Removes `path`; a file that is not there is not an error. */
  remove(path: string): Promise<void>;
}

/** The result: written, or why not — and, when the temporary file could not be removed either, which file is left. */
export type SafeWrite = { ok: true; path: string } | { ok: false; why: string; left?: string };

const CAUSES: Record<string, string> = {
  ENOSPC: 'the disk is full',
  EACCES: 'permission was refused',
  EPERM: 'permission was refused',
  EROFS: 'the folder cannot be written to',
  ENOENT: 'the folder is not there',
  ENAMETOOLONG: 'the file name is too long',
  EBUSY: 'the file is in use by another program',
};

const codeOf = (e: unknown): string => (e && typeof e === 'object' && 'code' in e ? String(e.code) : '');

/** Why, in words that complete "could not be written: …": a common cause by name, else the host's own message. */
function reason(e: unknown): string {
  const known = CAUSES[codeOf(e)];
  if (known) return known;
  const message = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  return message.trim().replace(/[.\s]+$/, '') || 'the host gave no reason';
}

/** Whether the temporary file is gone: removed, or never there. */
async function cleared(ops: WriteOps, temp: string): Promise<boolean> {
  try {
    await ops.remove(temp);
    return true;
  } catch (e) {
    return codeOf(e) === 'ENOENT';
  }
}

const failed = (why: string): SafeWrite => ({
  ok: false,
  why: `The export could not be written: ${why}. Nothing was saved.`,
});

/**
 * Writes `bytes` to `path` by way of `temp` (`<path>.part` unless another name is given): write there, then rename into
 * place. Whatever fails, the target is never written to directly, the temporary file is removed, and the result says why. When
 * even that removal fails, the result names the file left so the user can delete it. Nothing to write, or a temporary name
 * that is the target, is refused before any file is touched.
 */
export async function writeSafely(
  path: string,
  bytes: Uint8Array | string,
  ops: WriteOps,
  temp: string = `${path}.part`,
): Promise<SafeWrite> {
  if (!(typeof bytes === 'string' ? bytes.length : bytes.byteLength)) return failed('there is nothing to write');
  if (temp === path) return failed('the temporary file would be the target itself');
  try {
    await ops.write(temp, bytes);
    await ops.rename(temp, path);
    return { ok: true, path };
  } catch (e) {
    if (await cleared(ops, temp)) return failed(reason(e));
    return {
      ok: false,
      why: `The export could not be written: ${reason(e)}. The temporary file ${temp} could not be removed, so delete it by hand.`,
      left: temp,
    };
  }
}
