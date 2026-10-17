// The editor server's routes for changes (editor spec §41): a note's earlier versions for the changes view, read from its
// git repository (changes_view), and the pull requests, merges and commits of that repository read from GitHub for a
// review (github_review_items). Each is read only when the page asks; a version or an item is opened only once it was
// listed for the note, so the page never names a commit or an address; and every text is held to the gate first.
//   GET notes/<id>/versions                  {versions: [{commit, kind, label}]}, or 404 {why}
//   GET notes/<id>/at/<commit>               {text} at a commit just listed for it
//   GET notes/<id>/reviews                   {items: [{kind, id, title, author, when, url}]}, or 404 {why}
//   GET notes/<id>/reviews/<kind>/<item id>  {files: [{path, before, after}], withheld: [{path, why}], workstreams, unread}
import type { ReviewItem } from '@graph-note/core';
import type { GitHubReader } from './github-reader.ts';
import type { NoteHistory } from './note-history.ts';
import type { ApiAnswer } from './start-server.ts';

/** The tail of a review route: the list, or one item by its kind and id. */
export const REVIEW_ROUTE = /^\/reviews(?:\/(pull|merge|commit)\/([1-9][0-9]{0,8}|[0-9a-f]{40}))?$/;

/** What a route of changes is given for one open note. */
export interface ChangesAsked {
  /** The note's real path where the gate lets its text be sent; else the answer why not. */
  sendable: () => Promise<string | ApiAnswer>;
  /** The gate's word on an earlier text of the note, null when it may be sent. */
  refusal: (text: string) => string | null;
  /** The gate's word on a file of the repository, null when it may be sent. */
  held: (text: string) => string | null;
  history: NoteHistory;
  github: GitHubReader;
  /** The commits last listed as the note's versions, and the items last listed for review, by kind and id. */
  listed: { versions: Set<string>; items: Map<string, ReviewItem> };
}

const json = (status: number, body: object): ApiAnswer => ({
  status,
  text: JSON.stringify(body),
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

/** Answers `tail`, a route of changes on one note: the versions, a text at one, the review items, or one item. */
export async function changesAnswer(tail: string, a: ChangesAsked): Promise<ApiAnswer> {
  const at = /^\/at\/([0-9a-f]{40})$/.exec(tail)?.[1];
  if (at && !a.listed.versions.has(at)) return json(404, { why: 'No such version of this note.' });
  const m = REVIEW_ROUTE.exec(tail);
  if (!at && tail !== '/versions' && !m) return json(404, { why: 'No such change.' });
  if (m?.[1] && !a.listed.items.has(`${m[1]}/${m[2]}`))
    return json(404, { why: 'No such change listed for this note.' });
  // a note the gate holds back says nothing of its history or its repository either
  const real = await a.sendable();
  if (typeof real !== 'string') return real;
  if (tail === '/versions') {
    const v = await a.history.versions(real);
    a.listed.versions = new Set(v.ok ? v.versions.map((x) => x.commit) : []);
    return v.ok ? json(200, { versions: v.versions }) : json(404, { why: v.why });
  }
  if (at) {
    const t = await a.history.textAt(real, at);
    if (!t.ok) return json(404, { why: t.why });
    const refused = a.refusal(t.text);
    return refused === null ? json(200, { text: t.text }) : json(403, { why: refused });
  }
  if (!m?.[1]) {
    const r = await a.github.items(real);
    a.listed.items.clear();
    if (!r.ok) return json(404, { why: r.why });
    for (const item of r.value) a.listed.items.set(`${item.kind}/${item.id}`, item);
    return json(200, { items: r.value });
  }
  const r = await a.github.files(real, a.listed.items.get(`${m[1]}/${m[2]}`) as ReviewItem);
  if (!r.ok) return json(404, { why: r.why });
  const withheld: { path: string; why: string }[] = [];
  const files = r.value.files.filter((f) => {
    const why = [f.before, f.after].map((t) => (t === null ? null : a.held(t))).find((w) => w !== null) ?? null;
    if (why !== null) withheld.push({ path: f.path, why });
    return why === null;
  });
  const workstreams = r.value.workstreams !== null && a.held(r.value.workstreams) === null ? r.value.workstreams : null;
  return json(200, { files, withheld, workstreams, unread: r.value.unread });
}
