// The tab's page reaches the note's folder only through these calls (spec §41, vscode_plugin). They are the desktop
// app's seven folder commands, less the folder picker, so the page's side is the app's own (tauri-files.ts). Here,
// in the extension, each call is checked by place.ts before the disk is asked. Then it is answered from the disk handed
// in, which is VS Code's file system over the folder (extension.ts). So this file imports no vscode, and the tests
// hand in a folder of their own.
import { linkFree, placeProblem, SYMBOLIC_LINK } from './place.ts';

/** VS Code's file type bit for a folder (`FileType.Directory`). */
const DIRECTORY = 2;

/** The folder's disk, each by a path inside it. A read of a file not there throws an error whose code is `ENOENT`. */
export interface FolderDisk {
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  writeBytes(path: string, bytes: Uint8Array): Promise<void>;
  delete(path: string): Promise<void>;
  /** Each entry of a folder, its name and its file type bits. */
  readDirectory(path: string): Promise<[string, number][]>;
  /** Makes a folder and the folders above it. */
  createDirectory(path: string): Promise<void>;
  /** A path's file type bits, or null when nothing is there. */
  typeOf(path: string): Promise<number | null>;
}

/** A call from the page: its number, the command's name and its arguments. */
export interface FolderCall {
  kind: 'call';
  id: number;
  call: string;
  args?: Record<string, unknown>;
}

/** The answer to a call by its number: its value, or the error's words (`ENOENT` when no file is there). */
export type FolderReply =
  { kind: 'reply'; id: number; ok: true; value: unknown } | { kind: 'reply'; id: number; ok: false; error: string };

/** Whether `message` is a call from the page. Anything else the page posts is not answered. */
export const isFolderCall = (message: unknown): message is FolderCall =>
  !!message &&
  typeof message === 'object' &&
  (message as FolderCall).kind === 'call' &&
  Number.isInteger((message as FolderCall).id) &&
  typeof (message as FolderCall).call === 'string';

/** `name` with `n` before its ending, as the desktop app numbers a name taken: `a.svg`, `a-2.svg`, `a-3.svg`. */
const numbered = (name: string, n: number) =>
  n === 1 ? name : /\.[^.]+$/.test(name) ? name.replace(/(\.[^.]+)$/, `-${n}$1`) : `${name}-${n}`;

/** The calls, answered from `disk`. */
export function folderCalls(disk: FolderDisk) {
  /** `path`, once it keeps every rule and no step to it is a link; throws the reason otherwise. */
  const checked = async (path: unknown, folder = false): Promise<string> => {
    const problem = placeProblem(path, { folder });
    if (problem) throw new Error(problem);
    if (!(await linkFree(path as string, (step) => disk.typeOf(step)))) throw new Error('a link is never followed');
    return path as string;
  };
  const text = (v: unknown): string => {
    if (typeof v !== 'string') throw new Error('the text must be text');
    return v;
  };

  /** An export's files written as new files in `into`, never over one: all of them, or none. */
  const writeNew = async (into: unknown, files: unknown): Promise<string[]> => {
    const folder = await checked(into, true);
    if (!Array.isArray(files) || files.length === 0) throw new Error('an export has files');
    const planned: [string, Uint8Array][] = [];
    for (const file of files as unknown[]) {
      const [name, bytes] = (Array.isArray(file) ? file : []) as unknown[];
      if (typeof name !== 'string' || name.includes('/') || placeProblem(name))
        throw new Error('a file needs a plain name');
      if (!Array.isArray(bytes) || bytes.some((b) => !Number.isInteger(b) || b < 0 || b > 255))
        throw new Error('a file is bytes');
      let n = 1;
      const at = (k: number) => (folder ? `${folder}/${numbered(name, k)}` : numbered(name, k));
      while ((await disk.typeOf(at(n))) !== null || planned.some(([p]) => p === at(n))) n++;
      planned.push([at(n), Uint8Array.from(bytes as number[])]);
    }
    if (folder) await disk.createDirectory(folder);
    const written: string[] = [];
    try {
      for (const [path, bytes] of planned) {
        await disk.writeBytes(path, bytes);
        written.push(path);
      }
    } catch (e) {
      for (const path of written) await disk.delete(path).catch(() => undefined);
      throw e;
    }
    return planned.map(([path]) => path.slice(path.lastIndexOf('/') + 1));
  };

  const commands: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
    read_text: async ({ path }) => disk.readText(await checked(path)),
    write_text: async ({ path, text: t }) => disk.writeText(await checked(path), text(t)),
    remove_file: async ({ path }) => disk.delete(await checked(path)),
    // a link in a folder is left out of its list, so the notes are never walked through one
    read_dir: async ({ path }) =>
      (await disk.readDirectory(await checked(path, true)))
        .filter(([, type]) => !(type & SYMBOLIC_LINK))
        .map(([name, type]) => [name, !!(type & DIRECTORY)]),
    make_dir: async ({ path }) => disk.createDirectory(await checked(path)),
    write_new: async ({ into, files }) => writeNew(into, files),
  };

  /** The answer to `message`. A call by an unknown name is refused in words. */
  return async (message: FolderCall): Promise<FolderReply> => {
    const { id, call, args = {} } = message;
    const run = Object.hasOwn(commands, call) ? commands[call] : undefined;
    try {
      if (!run) throw new Error(`no such call: ${call}`);
      return { kind: 'reply', id, ok: true, value: (await run(args)) ?? null };
    } catch (e) {
      const code = (e as { code?: unknown } | null)?.code;
      const notThere = code === 'ENOENT' || code === 'FileNotFound' || code === 'EntryNotFound';
      return { kind: 'reply', id, ok: false, error: notThere ? 'ENOENT' : e instanceof Error ? e.message : String(e) };
    }
  };
}
