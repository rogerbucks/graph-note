// The checks the editor server makes on every request, before it does anything. They are (spec §26: cc_host_checked,
// cc_origin_checked, cc_session_token, cc_token_unkept, cc_csp):
// - the Host must name the server itself;
// - nothing may come from another origin;
// - a write must come from the server's own page;
// - an API call must carry the session's token as a Bearer header, compared in constant time.
// Also the headers every answer carries, whatever its status.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

/**
 * The content security policy of every answer: the server's own origin only, no inline script and no eval, never
 * framed. Also no base address, form target or plugin, which `default-src` does not cover.
 */
export const CSP =
  "default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'; img-src 'self' data: blob:; " +
  "style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'";

/**
 * The headers every answer carries, Node's own refusals included. They give the policy, no sniffing, nothing cached, no
 * referrer, no use by another site, and no window shared with another origin's.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy': CSP,
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-origin',
  'cross-origin-opener-policy': 'same-origin',
};

/** A fresh session token: 256 random bits, as base64url, made once for each start and kept only in memory. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Whether a Host header names this server exactly: `127.0.0.1` or `localhost`, with its port. Anything else, a DNS
 * rebinding's name or Tailscale's among them, is refused; no forwarded header is read.
 */
export function hostAllowed(host: string | undefined, port: number): boolean {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

/** The server's own origin as a page loaded from it under that Host says it. */
export const originOf = (host: string): string => `http://${host}`;

const one = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? undefined : value);

/**
 * Why a request is refused as cross-origin, or null. It is refused for an Origin that is not the server's own. It is
 * also refused when a browser says the request comes from another site. A navigation typed or opened by the user
 * (`Sec-Fetch-Site: none`) is not.
 */
export function crossOrigin(headers: IncomingHttpHeaders, host: string): string | null {
  const origin = one(headers.origin);
  const site = one(headers['sec-fetch-site']);
  if ('origin' in headers && origin !== originOf(host)) return 'This server answers no request from another origin.';
  if ('sec-fetch-site' in headers && site !== 'same-origin' && site !== 'none')
    return 'This server answers no request from another site.';
  return null;
}

/** Whether a change may be made: its Origin the server's own, and the browser saying it comes from the same origin. */
export function writeAllowed(headers: IncomingHttpHeaders, host: string): boolean {
  return one(headers.origin) === originOf(host) && one(headers['sec-fetch-site']) === 'same-origin';
}

const digest = (text: string): Uint8Array => new Uint8Array(createHash('sha256').update(text, 'utf8').digest());

/**
 * Whether an Authorization header carries the session's token, as `Bearer <token>` and nothing else. Both are hashed
 * to the same length first, so the comparison takes the same time however much of the token is right.
 */
export function tokenMatches(authorization: string | undefined, sessionToken: string): boolean {
  const given = /^Bearer ([A-Za-z0-9_-]+)$/.exec(authorization ?? '')?.[1];
  const same = timingSafeEqual(digest(given ?? ''), digest(sessionToken));
  return given !== undefined && same;
}
