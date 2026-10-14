// The editor's local server (spec §26, slice 4; workstream C0): Node's own http, no framework, listening on 127.0.0.1
// alone, on a port the system chooses, one for each session (cc_loopback_only, cc_one_server). Every request passes the
// checks of request-guard.ts first; an API call needs the session's token; a body is held to the core's read limit; and
// the server stops after an idle period with no page, or at once when told. It makes no outgoing request (cc_no_remote).
// The page and its files say nothing about any note, so they are served without the token, which a browser's
// navigation cannot carry as a header; the token reaches the page in the address's fragment, which is never sent.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readBody, BODY_LIMIT } from './request-body.ts';
import { SECURITY_HEADERS, crossOrigin, hostAllowed, newToken, tokenMatches, writeAllowed } from './request-guard.ts';
import { TEST_NOTE_ROUTE, TestNotes } from './test-note.ts';

/** How long the server waits with no page before it stops: 30 minutes. */
export const IDLE_MS = 30 * 60 * 1000;

/** How often the server checks whether it has been idle that long. */
export const IDLE_CHECK_MS = 60 * 1000;

/** Runs `check` every `ms` milliseconds until the function it gives back is called. */
export type Every = (ms: number, check: () => void) => () => void;

/** How a server is started. It takes no host and no port: it listens on 127.0.0.1, on a port the system chooses. */
export interface EditorServerOptions {
  /** How long with no page before it stops; IDLE_MS unless a test says otherwise. */
  idleMs?: number;
  /** The clock the idle wait is measured by, in milliseconds; Date.now unless handed in. */
  now?: () => number;
  /** How the idle check is run on a timer; a test hands in its own and runs the checks by hand. */
  every?: Every;
  /** TEST ONLY: notes held in memory and served at TEST_NOTE_ROUTE, for the threat tests (C1 is the real store). */
  testNotes?: Readonly<Record<string, string>>;
}

/** A running editor server. */
export interface EditorServer {
  /** Always 127.0.0.1. */
  readonly address: string;
  readonly port: number;
  /** `http://127.0.0.1:<port>`. */
  readonly origin: string;
  /** The session's token, made at this start and kept only in memory. */
  readonly token: string;
  /** Why it stopped, or null while it runs. */
  readonly stopped: string | null;
  /** How many requests are open now: while any is, the server is not idle. */
  readonly openRequests: number;
  /** Resolves, with why, once it has stopped and its port is closed. */
  readonly closed: Promise<string>;
  /** Stops it at once: no new connection, every open one closed. */
  stop(reason?: string): Promise<string>;
}

const OPTION_NAMES = new Set(['idleMs', 'now', 'every', 'testNotes']);

/** The page until the editor's own is built (workstream C5): it says so, and loads nothing. */
const PAGE =
  '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Graph Note editor</title></head>\n' +
  '<body><p>The Graph Note editor is not here yet.</p></body></html>\n';

const realEvery: Every = (ms, check) => {
  const timer = setInterval(check, ms);
  timer.unref();
  return () => clearInterval(timer);
};

/** Sends an answer with the headers every answer carries; nothing in it ever repeats the token. */
function send(res: ServerResponse, status: number, text: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8', ...headers });
  res.end(status === 204 ? undefined : text);
}

/** Starts a server on 127.0.0.1, on a port the system chooses, with a fresh token. */
export async function startEditorServer(options: EditorServerOptions = {}): Promise<EditorServer> {
  for (const name of Object.keys(options))
    if (!OPTION_NAMES.has(name))
      throw new TypeError(`The editor server takes no ${name}: it listens on 127.0.0.1, on a port the system chooses.`);
  const sessionToken = newToken();
  const now = options.now ?? Date.now;
  const idleMs = options.idleMs ?? IDLE_MS;
  const notes = options.testNotes ? new TestNotes(options.testNotes) : null;
  let last = now(),
    open = 0,
    stopped: string | null = null,
    port = 0;

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const host = req.headers.host;
    if (host === undefined || !hostAllowed(host, port))
      return send(res, 403, 'This server answers only its own address.');
    const elsewhere = crossOrigin(req.headers, host);
    if (elsewhere) return send(res, 403, elsewhere);
    if (req.method === 'OPTIONS') return send(res, 403, 'This server answers no request from another origin.');
    const url = req.url ?? '/';
    if (url.includes('?') || url.includes('#'))
      return send(res, 400, 'This server takes nothing in the address after its path, and never a token.');
    if (req.method !== 'GET' && req.method !== 'PUT') return send(res, 405, 'This server takes only GET and PUT.');
    if (!url.startsWith('/api/')) {
      if (url === '/' && req.method === 'GET')
        return send(res, 200, PAGE, { 'content-type': 'text/html; charset=utf-8' });
      return send(res, 404, 'Not found.');
    }
    if (!tokenMatches(req.headers.authorization, sessionToken))
      return send(res, 401, 'Not authorised.', { 'www-authenticate': 'Bearer' });
    if (req.method === 'PUT' && !writeAllowed(req.headers, host))
      return send(res, 403, 'A change must come from the editor’s own page.');
    const body = req.method === 'PUT' ? await readBody(req) : '';
    if (body === null) {
      req.resume();
      return send(res, 413, `Larger than a note may be: at most ${BODY_LIMIT} bytes.`, { connection: 'close' });
    }
    if (notes && url.startsWith(TEST_NOTE_ROUTE)) {
      const answer = notes.answer(req.method, url.slice(TEST_NOTE_ROUTE.length), body, req.headers['if-match']);
      return send(res, answer.status, answer.text, answer.headers);
    }
    return send(res, 404, 'Not found.');
  }

  const server = createServer((req, res) => {
    open++;
    last = now();
    res.on('close', () => {
      open--;
      last = now();
    });
    handle(req, res).catch(() => {
      if (!res.headersSent) send(res, 500, 'The server could not answer.');
      else res.destroy();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      server.off('error', reject);
      resolve();
    });
  });
  port = (server.address() as AddressInfo).port;

  let markClosed: (why: string) => void = () => {};
  const closed = new Promise<string>((resolve) => (markClosed = resolve));
  const every = options.every ?? realEvery;
  const cancel = every(IDLE_CHECK_MS, () => {
    if (open === 0 && now() - last >= idleMs) void stop('idle');
  });

  function stop(reason = 'stop'): Promise<string> {
    if (stopped !== null) return closed;
    stopped = reason;
    cancel();
    server.close(() => markClosed(reason));
    server.closeAllConnections();
    return closed;
  }

  return {
    address: '127.0.0.1',
    port,
    origin: `http://127.0.0.1:${port}`,
    token: sessionToken,
    get stopped() {
      return stopped;
    },
    get openRequests() {
      return open;
    },
    closed,
    stop,
  };
}
