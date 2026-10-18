// The settings the page shows (spec §26, cc_settings_shared): the same ThoughtKnot settings the mod reads from its data
// folder, which the mod hands the server in its environment (`THOUGHTKNOT_EDITOR_SETTINGS`), read back by the core as the
// plugin reads them, so a missing or out-of-range one is its default. They are read only: `GET /api/settings` answers, a
// write is refused, and the page has nothing to change them with. No AI model is passed on, as Claude is the only AI the
// browser editor offers (cc_claude_only), and none of a model's address or key is ever held here.
import { settingsFrom } from '@thoughtknot/core';
import type { ApiHandler } from './start-server.ts';

/** The settings as the page is told them, from the JSON the mod handed over; none, or unreadable, is the defaults. */
export function pageSettings(raw: string | undefined): ReturnType<typeof settingsFrom> {
  let saved: unknown = null;
  try {
    saved = JSON.parse(raw || 'null');
  } catch {
    // unreadable settings are the defaults, as the core reads any that cannot be
  }
  return { ...settingsFrom(saved), aiModels: [] };
}

/** `inner`, with `settings` answered here, read only. */
export function withSettings(raw: string | undefined, inner: ApiHandler | undefined): ApiHandler {
  return (request) => {
    if (request.path !== 'settings') return inner ? inner(request) : { status: 404, text: 'Not found.' };
    if (request.method !== 'GET') return { status: 405, text: 'The settings are read here and never changed.' };
    return {
      status: 200,
      text: JSON.stringify(pageSettings(raw)),
      headers: { 'content-type': 'application/json; charset=utf-8' },
    };
  };
}
