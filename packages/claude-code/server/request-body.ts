// A request's body read within the core's read limit for a note (spec §26, cc_body_limit; §9, READ_LIMITS): a body
// declared larger is refused before any of it is read, and one sent in parts with no length is refused as soon as it
// passes the limit, so no request can make the server hold more than one note's worth.
import type { IncomingMessage } from 'node:http';
import { READ_LIMITS } from '@graph-note/core';

/** The most bytes a request's body may hold: the core's read limit for a note. */
export const BODY_LIMIT = READ_LIMITS.bytes;

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
