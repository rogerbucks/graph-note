// The editor's local server (spec §26, slice 4; workstream C0): Node's own http, no framework, listening on 127.0.0.1
// alone, on a port the system chooses, one for each session (cc_loopback_only, cc_one_server). Every request passes the
// checks of request-guard.ts first; an API call needs the session's token; a body is held to the core's read limit; and
// the server stops after an idle period with no page, or at once when told. It makes no outgoing request (cc_no_remote).
// The page and its files say nothing about any note, so they are served without the token, which a browser's
// navigation cannot carry as a header; the token reaches the page in the address's fragment, which is never sent.
// What the API does is handed in (`api`): the note store (editor-store.ts, workstream C1), whose answers may be a
// stream (`feed`), and what a stop waits for (`drain`), so a write under way is finished before the process exits.
import {
  STATUS_CODES,
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerOptions,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { readBody, BODY_LIMIT } from './request-body.ts';
import { SECURITY_HEADERS, crossOrigin, hostAllowed, newToken, tokenMatches, writeAllowed } from './request-guard.ts';

/** How long the server waits with no page before it stops: 30 minutes. */
export const IDLE_MS = 30 * 60 * 1000;

/** How often the server checks whether it has been idle that long. */
export const IDLE_CHECK_MS = 60 * 1000;

/**
 * The server's own limits on what a client may hold of it: time to send the headers, time for a whole request, how
 * long an idle connection is kept, how many headers are read, and how many connections at once.
 */
export const SERVER_LIMITS = {
  headersTimeout: 10_000,
  requestTimeout: 30_000,
  keepAliveTimeout: 5_000,
  maxHeadersCount: 64,
  maxConnections: 32,
} as const;

/** Runs `check` every `ms` milliseconds until the function it gives back is called. */
export type Every = (ms: number, check: () => void) => () => void;

/** An API call that has passed every check: its method, its path after `/api/`, its body (a PUT's) and headers. */
export interface ApiRequest {
  method: 'GET' | 'PUT';
  path: string;
  body: string;
  headers: IncomingHttpHeaders;
}

/**
 * A stream the page reads with fetch, so the token stays in a header: `start` is handed what sends each piece, and
 * gives back what ends the stream's part in the API once the connection closes, whoever closes it.
 */
export type ApiFeed = (send: (text: string) => void) => () => void;

/** What the API answers: a status, its text and any headers of its own; or, for a stream, its feed in place of text. */
export interface ApiAnswer {
  status: number;
  text: string;
  headers?: Record<string, string>;
  feed?: ApiFeed;
}

/** What answers the API calls that pass the server's checks. */
export type ApiHandler = (request: ApiRequest) => ApiAnswer | Promise<ApiAnswer>;

/** How a server is started. It takes no host and no port: it listens on 127.0.0.1, on a port the system chooses. */
export interface EditorServerOptions {
  /** How long with no page before it stops; IDLE_MS unless a test says otherwise. */
  idleMs?: number;
  /** The clock the idle wait is measured by, in milliseconds; Date.now unless handed in. */
  now?: () => number;
  /** How the idle check is run on a timer; a test hands in its own and runs the checks by hand. */
  every?: Every;
  /** What answers the API; with none, every API call that passes the checks is not found. */
  api?: ApiHandler;
  /**
   * What a stop waits for before the server counts as stopped: the note store refusing any further write and finishing
   * those under way (C0 review), so the process never exits half way through one.
   */
  drain?: () => Promise<void>;
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
  /** The limits the running server holds clients to, read from it. */
  readonly limits: Record<keyof typeof SERVER_LIMITS, number | null>;
  /** Resolves, with why, once it has stopped and its port is closed. */
  readonly closed: Promise<string>;
  /** Stops it at once: no new connection, every open one closed. */
  stop(reason?: string): Promise<string>;
}

const OPTION_NAMES = new Set(['idleMs', 'now', 'every', 'api', 'drain']);

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

/** Node's own refusal of a request it could not read (400, 408 or 431), with the headers every answer carries. */
function refuseUnread(err: Error & { code?: string }, socket: Duplex): void {
  if (!socket.writable || err.code === 'ECONNRESET') {
    socket.destroy();
    return;
  }
  const status = err.code === 'HPE_HEADER_OVERFLOW' ? 431 : err.code === 'ERR_HTTP_REQUEST_TIMEOUT' ? 408 : 400;
  const headers = Object.entries(SECURITY_HEADERS)
    .map(([name, value]) => `${name}: ${value}\r\n`)
    .join('');
  socket.end(`HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\n${headers}content-length: 0\r\nconnection: close\r\n\r\n`);
}

/** Starts a server on 127.0.0.1, on a port the system chooses, with a fresh token. */
export async function startEditorServer(options: EditorServerOptions = {}): Promise<EditorServer> {
  for (const name of Object.keys(options))
    if (!OPTION_NAMES.has(name))
      throw new TypeError(`The editor server takes no ${name}: it listens on 127.0.0.1, on a port the system chooses.`);
  const sessionToken = newToken();
  const now = options.now ?? Date.now;
  const idleMs = options.idleMs ?? IDLE_MS;
  const api = options.api;
  let last = now(),
    open = 0,
    stopped: string | null = null,
    port = 0;

  /** Answers one request; `seen` marks it as the page's, which starts the idle wait again. */
  async function handle(req: IncomingMessage, res: ServerResponse, seen: () => void): Promise<void> {
    const host = req.headers.host;
    if (host === undefined || !hostAllowed(host, port))
      return send(res, 403, 'This server answers only its own address.');
    const elsewhere = crossOrigin(req.headers, host);
    if (elsewhere) return send(res, 403, elsewhere);
    if (req.method === 'OPTIONS') return send(res, 403, 'This server answers no request from another origin.');
    const url = req.url ?? '/';
    if (url.includes('?') || url.includes('#'))
      return send(res, 400, 'This server takes nothing in the address after its path, and never a token.');
    const method = req.method;
    if (method !== 'GET' && method !== 'PUT') return send(res, 405, 'This server takes only GET and PUT.');
    if (!url.startsWith('/api/')) {
      if (url !== '/' || method !== 'GET') return send(res, 404, 'Not found.');
      seen();
      return send(res, 200, PAGE, { 'content-type': 'text/html; charset=utf-8' });
    }
    if (!tokenMatches(req.headers.authorization, sessionToken))
      return send(res, 401, 'Not authorised.', { 'www-authenticate': 'Bearer' });
    seen();
    if (method === 'PUT' && !writeAllowed(req.headers, host))
      return send(res, 403, 'A change must come from the editor’s own page.');
    const body = method === 'PUT' ? await readBody(req) : '';
    if (body === null) {
      req.resume();
      return send(res, 413, `Larger than a note may be: at most ${BODY_LIMIT} bytes.`, { connection: 'close' });
    }
    if (!api) return send(res, 404, 'Not found.');
    // checked again after the body is read, so no call reaches the API once a stop has begun
    if (stopped !== null)
      return send(res, 503, 'The editor has stopped; nothing was written.', { connection: 'close' });
    const answer = await api({ method, path: url.slice('/api/'.length), body, headers: req.headers });
    if (!answer.feed) return send(res, answer.status, answer.text, answer.headers);
    res.writeHead(answer.status, { ...SECURITY_HEADERS, ...answer.headers });
    const end = answer.feed((text) => void (res.destroyed || res.write(text)));
    if (res.destroyed) end();
    else res.on('close', end);
  }

  // a request with no Host comes to `handle`, which refuses it with the headers every answer carries (Node takes
  // `requireHostHeader`, which the types this repository pins do not name yet)
  const server = createServer({ requireHostHeader: false } as ServerOptions, (req, res) => {
    open++;
    let page = false;
    res.on('close', () => {
      open--;
      if (page) last = now();
    });
    const seen = () => {
      page = true;
      last = now();
    };
    handle(req, res, seen).catch(() => {
      if (!res.headersSent) send(res, 500, 'The server could not answer.');
      else res.destroy();
    });
  });
  Object.assign(server, SERVER_LIMITS);
  server.on('clientError', refuseUnread);
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
    // the API stops taking writes and finishes those under way while the connections close
    const drained = (options.drain?.() ?? Promise.resolve()).catch(() => {});
    server.close(() => void drained.then(() => markClosed(reason)));
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
    get limits() {
      const { headersTimeout, requestTimeout, keepAliveTimeout, maxHeadersCount, maxConnections } = server;
      return { headersTimeout, requestTimeout, keepAliveTimeout, maxHeadersCount, maxConnections };
    },
    closed,
    stop,
  };
}
