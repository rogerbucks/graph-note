// The page's calls to the editor server that served it (spec §26): the session's token and the note's id come in the
// address's fragment, which a browser never sends, and are taken out of the address as they are read (cc_token_unkept).
// The token is kept in memory, in this closure, and nowhere else. Every call is to a path from the server's own root, so
// the page reaches no other origin (cc_no_remote, cc_offline); and the page only reads: settings are the mod's
// (cc_settings_shared), and a note is written by the session in a later workstream, never here.
import { settingsFrom } from '../../core/src/settings.ts';
import type { Settings } from '../../core/src/settings.ts';

/** What the server gives for a note: its text, its version and any draft kept for it. */
export interface NoteReply {
  text: string;
  version: string;
  draft: string | null;
}

/** The address's fragment as the token and the note's id; both are empty when the address had none. */
export function takeFragment(win: Window): { token: string; note: string } {
  const fields = new URLSearchParams(win.location.hash.replace(/^#/, ''));
  win.history.replaceState(null, '', win.location.pathname);
  return { token: fields.get('token') ?? '', note: fields.get('note') ?? '' };
}

/** The page's calls, with `token` held in them. */
export function serverCalls(token: string, fetcher: typeof fetch) {
  const get = async (path: string): Promise<unknown> => {
    const reply = await fetcher(`/api/${path}`, { headers: { authorization: `Bearer ${token}` } });
    if (!reply.ok) throw new Error(`The editor server said ${reply.status}: ${await reply.text()}`);
    return reply.json();
  };
  return {
    /** The settings the mod uses, read only. */
    settings: async (): Promise<Settings> => settingsFrom(await get('settings')),
    /** The note the session was opened for. */
    note: async (id: string): Promise<NoteReply> => (await get(`notes/${encodeURIComponent(id)}`)) as NoteReply,
  };
}
