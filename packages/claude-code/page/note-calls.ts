// The page's calls that follow and write the note (spec §26, cc_claude_proposes), apart from `server-calls.ts`, whose calls
// only read. The user's decision on a proposal is written here: the whole note, against the version the page last had,
// with the page's own token, which is the only key that writes. The server compares the version under its lock and refuses
// a stale one (409), keeping what was sent as a draft. Claude's key reaches no route this file calls.

/** A line of the change stream: the note as it is now, or why it is no longer sent. */
export type FollowLine = { version: string; text: string } | { gone: string };

/**
 * What a write came to: the note's new version, or why nothing was written: the server's status, and, for a stale write
 * (409), the note as it now is, with what was sent kept by the server as a draft.
 */
export type Written =
  | { ok: true; version: string }
  | { ok: false; why: string; status: number; theirs?: { text: string; version: string } };

/** The page's calls on one note, with `token` held in them. */
export function noteCalls(token: string, fetcher: typeof fetch) {
  const authorization = `Bearer ${token}`;
  return {
    /** Writes `text` as the note, if it is still `version`. */
    write: async (id: string, text: string, version: string): Promise<Written> => {
      const reply = await fetcher(`/api/notes/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { authorization, 'if-match': version, 'content-type': 'text/plain; charset=utf-8' },
        body: text,
      });
      if (reply.ok) return { ok: true, version: ((await reply.json()) as { version: string }).version };
      const theirs =
        reply.status === 409
          ? ((await reply.json().catch(() => null)) as { text: string; version: string } | null)
          : null;
      return {
        ok: false,
        status: reply.status,
        ...(theirs ? { theirs: { text: theirs.text, version: theirs.version } } : {}),
        why:
          reply.status === 409
            ? 'The note changed while you were deciding, so nothing was written. It is shown again as it now is.'
            : `The editor server said ${reply.status}, so nothing was written.`,
      };
    },
    /** Keeps what was typed as the note's draft, outside the vault; an empty text clears it. Resolves to whether it was kept. */
    keepDraft: async (id: string, text: string, version: string): Promise<boolean> => {
      const reply = await fetcher(`/api/notes/${encodeURIComponent(id)}/draft`, {
        method: 'PUT',
        headers: { authorization, 'if-match': version, 'content-type': 'text/plain; charset=utf-8' },
        body: text,
      });
      return reply.ok;
    },
    /** The change stream: the note now and each change after it, a line of JSON each, until either side ends it. */
    follow: async (id: string, onLine: (line: FollowLine) => void): Promise<void> => {
      const reply = await fetcher(`/api/notes/${encodeURIComponent(id)}/events`, { headers: { authorization } });
      if (!reply.ok || !reply.body) return;
      const reader = reply.body.getReader();
      const decoder = new TextDecoder();
      let held = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        held += decoder.decode(value, { stream: true });
        for (let end = held.indexOf('\n'); end >= 0; end = held.indexOf('\n')) {
          const line = held.slice(0, end);
          held = held.slice(end + 1);
          if (line.trim()) onLine(JSON.parse(line) as FollowLine);
        }
      }
    },
  };
}
