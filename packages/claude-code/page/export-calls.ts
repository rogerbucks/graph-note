// The page's calls for an export (spec §26, cc_exports_new_only). They are apart from server-calls.ts, which only
// reads.
// - It asks the server for the place the files will go.
// - It hands the files over to be written.
// The page names no folder or path of its own. The server writes the files only as new ones in the export folder. It
// answers the names they were given (a number is added to one that was taken). The token is the one the page holds,
// passed in. Every address is from the server's root.

/** One file of an export: its name alone, with its text or its bytes. */
export interface SavedFile {
  name: string;
  text?: string;
  bytes?: Uint8Array;
}

/** Where the files of an export go, as the server says: the note's path, and the export folder (empty is the vault's top). */
export interface ExportTarget {
  note: string;
  folder: string;
}

/** The names written, or why nothing was, in words. */
export type Saved = { written: string[] } | { stopped: string };

const base64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

/** The page's export calls, with `token` held in them. */
export function exportCalls(token: string, fetcher: typeof fetch) {
  const headers = { authorization: `Bearer ${token}` };
  return {
    /** Where an export of the note goes. */
    target: async (id: string): Promise<ExportTarget> => {
      const reply = await fetcher(`/api/export/${encodeURIComponent(id)}`, { headers });
      if (!reply.ok) throw new Error(`The editor server said ${reply.status}: ${await reply.text()}`);
      return (await reply.json()) as ExportTarget;
    },
    /** Hands the files over to be written as new files; never rejects: a refusal is said in words. */
    save: async (id: string, files: SavedFile[]): Promise<Saved> => {
      try {
        const body = JSON.stringify({
          files: files.map((f) =>
            f.bytes ? { name: f.name, base64: base64(f.bytes) } : { name: f.name, text: f.text },
          ),
        });
        const reply = await fetcher(`/api/export/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { ...headers, 'content-type': 'application/json' },
          body,
        });
        if (!reply.ok) return { stopped: await reply.text() };
        return { written: ((await reply.json()) as { written: string[] }).written };
      } catch (e) {
        return {
          stopped: `The export could not be sent to the editor: ${e instanceof Error ? e.message : String(e)}. Nothing was saved.`,
        };
      }
    },
  };
}
