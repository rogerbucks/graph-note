// A request's body read within the core's read limit for a note (spec §26, cc_body_limit; §9, READ_LIMITS): a body
// declared larger is refused before any of it is read, and one sent in parts with no length is refused as soon as it
// passes the limit, so no request can make the server hold more than one note's worth.
import type { IncomingMessage } from 'node:http';
import { READ_LIMITS } from '@thoughtknot/core';

/** The most bytes a request's body may hold: the core's read limit for a note. */
export const BODY_LIMIT = READ_LIMITS.bytes;

/** The most bytes the body of an export may hold (export-api.ts): an image, a PNG as base64, is larger than a note. */
export const EXPORT_BODY_LIMIT = 24 * 1024 * 1024;

/** The limit for a call to `url`: the export's own larger one for an export alone, the note's for all else. */
export const bodyLimitOf = (url: string): number =>
  /^\/api\/export\/[0-9a-f]{32}$/.test(url) ? EXPORT_BODY_LIMIT : BODY_LIMIT;

/** The body as UTF-8 text, or null when it is, or says it is, larger than `most` bytes. */
export async function readBody(req: IncomingMessage, most: number = BODY_LIMIT): Promise<string | null> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (!(declared <= most)) return null;
  const parts: Uint8Array[] = [];
  let size = 0;
  for await (const part of req) {
    const chunk = part as Uint8Array;
    size += chunk.length;
    if (size > most) return null;
    parts.push(chunk);
  }
  return Buffer.concat(parts).toString('utf8');
}
