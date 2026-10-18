// The export's part of the editor's API (spec §26, workstream C6; cc_exports_new_only). The page makes the files of an
// export (the Export form of §16, the image drawn, the PNG rasterised) and hands them over. This writes them, and only
// as new files in the export folder (export-files.ts). The page never names a place. A note is reached by the id the
// store gave it. The folder is the one the settings name, else the note's own, as the plugin's plan has it.
//   GET export/<id>   {note, folder}: the note's path in the vault, and the folder the files will be put in.
//   PUT export/<id>   {files: [{name, text} | {name, base64}]} gives {written: [name…]}. A PNG is base64, all else text.
// The call carries the token and the server's own origin like any change. Its body has its own, larger limit, as an
// image is larger than a note. Any other path keeps the note's limit.
import { posix } from 'node:path';
import { vaultFolder } from '@thoughtknot/core/hosts/vault-folder';
import type { ApiAnswer, ApiHandler, ApiRequest } from './start-server.ts';
import { EXPORT_BODY_LIMIT } from './request-body.ts';
import { NODE_EXPORT_FS, nameProblem, writeNewFiles, type ExportFs, type NewFile } from './export-files.ts';

export { EXPORT_BODY_LIMIT };

/** The most files one export holds: a PNG's pages and its companion note, with room over. */
export const MOST_FILES = 100;

const ROUTE = /^export\/([0-9a-f]{32})$/;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const NOT_OPEN: ApiAnswer = { status: 404, text: 'No such note is open.' };
const STOPPED: ApiAnswer = { status: 503, text: 'The editor has stopped; nothing was written.' };

const plain = (status: number, text: string): ApiAnswer => ({ status, text });
const json = (body: object): ApiAnswer => ({
  status: 200,
  text: JSON.stringify(body),
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

/** What an exporter is made from. */
export interface ExporterOptions {
  /** The vault's real path. */
  vault: string;
  /** The export folder as the settings give it, inside the vault; empty is the note's own folder. */
  exportFolder: string;
  /** A note's path in the vault by the id the store gave it, or null for an id never opened. */
  notePath: (id: string) => string | null;
  /** The file operations; Node's own unless a test hands in its own. */
  fs?: ExportFs;
}

/** The files an export holds, decoded, or why the request is not one. */
function filesOf(body: string): NewFile[] | string {
  let given: unknown;
  try {
    given = JSON.parse(body);
  } catch {
    return 'The request is not JSON.';
  }
  const list = given && typeof given === 'object' ? (given as { files?: unknown }).files : undefined;
  if (!Array.isArray(list) || list.length === 0) return 'The request holds no files.';
  if (list.length > MOST_FILES) return `An export holds at most ${MOST_FILES} files.`;
  const files: NewFile[] = [];
  const seen = new Set<string>();
  for (const item of list as unknown[]) {
    const f = (item && typeof item === 'object' ? item : {}) as { name?: unknown; text?: unknown; base64?: unknown };
    const problem = nameProblem(f.name);
    if (problem) return problem;
    const name = f.name as string;
    if (seen.has(name.toLowerCase())) return `${name} is named twice.`;
    seen.add(name.toLowerCase());
    const image = name.endsWith('.png');
    if ((f.text === undefined) === (f.base64 === undefined)) return `${name} needs its text or its bytes, one of them.`;
    if (image) {
      const bytes = typeof f.base64 === 'string' ? Buffer.from(f.base64, 'base64') : null;
      // only canonical base64 decodes and encodes back to itself
      if (!bytes || bytes.toString('base64') !== f.base64) return `${name} is a PNG, sent as base64.`;
      if (PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) return `${name} is not a PNG image.`;
      files.push({ name, bytes: new Uint8Array(bytes) });
    } else {
      if (typeof f.text !== 'string') return `${name} is text, not bytes.`;
      files.push({ name, bytes: new TextEncoder().encode(f.text) });
    }
  }
  return files;
}

/** Writes exports for the notes the store has open. */
export class Exporter {
  private readonly o: ExporterOptions;
  private readonly underway = new Set<Promise<unknown>>();
  private stopped = false;

  constructor(options: ExporterOptions) {
    this.o = options;
  }

  /** Answers an export call, or null when the path is not one. */
  readonly handle = async (r: ApiRequest): Promise<ApiAnswer | null> => {
    const id = ROUTE.exec(r.path)?.[1];
    if (!id) return null;
    const note = this.o.notePath(id);
    if (note === null) return NOT_OPEN;
    if (this.stopped) return STOPPED;
    const set = vaultFolder(this.o.exportFolder);
    if (set === null) return plain(403, 'The export folder set is not a folder an export may use. Nothing was saved.');
    const folder = set || (posix.dirname(note) === '.' ? '' : posix.dirname(note));
    if (r.method === 'GET') return json({ note, folder });
    const files = filesOf(r.body);
    if (typeof files === 'string') return plain(400, files);
    const writing = writeNewFiles(this.o.vault, folder, files, this.o.fs ?? NODE_EXPORT_FS);
    this.underway.add(writing);
    const made = await writing.finally(() => this.underway.delete(writing));
    return made.ok ? json({ written: made.names }) : plain(made.status, made.why);
  };

  /** Starts no more writes, and resolves once those under way are done. */
  async stop(): Promise<void> {
    this.stopped = true;
    await Promise.allSettled([...this.underway]);
  }
}

/** `inner`, with the export's routes answered here. */
export function withExport(exporter: Exporter, inner: ApiHandler | undefined): ApiHandler {
  return async (request) =>
    (await exporter.handle(request)) ?? (inner ? inner(request) : { status: 404, text: 'Not found.' });
}
