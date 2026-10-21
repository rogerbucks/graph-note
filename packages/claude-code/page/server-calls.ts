// The page's calls to the editor server that served it (spec §26). The session's token and the note's id come in the
// address's fragment, which a browser never sends. They are taken out of the address as they are read
// (cc_token_unkept). The token is kept in memory, in this closure, and nowhere else. Every call is to a path from the
// server's own root. So the page reaches no other origin (cc_no_remote, cc_offline). And the page only reads. Settings
// are the mod's (cc_settings_shared). The session writes a note in a later workstream, never here.
import { settingsFrom } from '../../core/src/settings.ts';
import type { Settings } from '../../core/src/settings.ts';
import type { PageVersion } from './changes-section.ts';
import type { PageItemFiles } from './review-section.ts';
import type { ReviewItem } from '../../core/src/github-review-items.ts';
import { word } from '../../core/src/words.ts';

/** What the server gives for a note: its text, its version and any draft kept for it, with the version it was typed against. */
export interface NoteReply {
  text: string;
  version: string;
  draft: { text: string; against: string | null } | string | null;
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
    if (!reply.ok) throw new Error(word('page.server-said-why', { status: reply.status, why: await reply.text() }));
    return reply.json();
  };
  // an answer the server explains with a `why` is said in its words
  const explained = async (path: string): Promise<unknown> => {
    const reply = await fetcher(`/api/${path}`, { headers: { authorization: `Bearer ${token}` } });
    const body = (await reply.json().catch(() => ({}))) as { why?: unknown };
    if (!reply.ok)
      throw new Error(typeof body.why === 'string' ? body.why : word('page.server-said', { status: reply.status }));
    return body;
  };
  const id = (note: string) => `notes/${encodeURIComponent(note)}`;
  return {
    /** The note's earlier versions, asked for only when the user asks to compare (changes_view). */
    versions: async (note: string): Promise<PageVersion[]> =>
      ((await explained(`${id(note)}/versions`)) as { versions: PageVersion[] }).versions,
    /** The note's text at one of the versions just listed. */
    textAt: async (note: string, commit: string): Promise<string> =>
      ((await explained(`${id(note)}/at/${encodeURIComponent(commit)}`)) as { text: string }).text,
    /** The pull requests, merges and commits of the note's repository, asked for only when the user asks to review. */
    reviews: async (note: string): Promise<ReviewItem[]> =>
      ((await explained(`${id(note)}/reviews`)) as { items: ReviewItem[] }).items,
    /** One of the items just listed, with its changed files. */
    review: async (note: string, item: ReviewItem): Promise<PageItemFiles> =>
      (await explained(
        `${id(note)}/reviews/${encodeURIComponent(item.kind)}/${encodeURIComponent(item.id)}`,
      )) as PageItemFiles,
    /** The settings the mod uses, read only. */
    settings: async (): Promise<Settings> => settingsFrom(await get('settings')),
    /** The note the session was opened for. */
    note: async (id: string): Promise<NoteReply> => (await get(`notes/${encodeURIComponent(id)}`)) as NoteReply,
  };
}
