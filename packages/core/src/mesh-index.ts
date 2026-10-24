// The local store of the graph mesh (editor spec §27, mesh_index_rebuilds; §40, embedded_backends; Q-05). The notes'
// text is the only store of a graph (mesh_text_canonical). This index is derived from it: it reads each note into
// rows, keeps them in a backend, and answers queries from there. It can always be dropped and built again from the
// notes, and it then answers the same (mesh_rebuilt_alike). Moving to another backend is a rebuild, never a rewrite.
//
// Two backends answer every query alike:
// - memory, for a small vault or a test;
// - SQLite, in the process, through an engine the host hands in (sql.js on every host). No server and no JVM are
//   needed, so a locked-down install runs it as it is (embedded_backends).
//
// Its reads are what a huge graph is drawn from in parts (editor spec §53, scale_in_parts). They are each per note,
// and paged, and none gives the whole graph:
// - `groups`: each group and the links between groups, counted, so an overview needs no things;
// - `inGroups`: the things and links inside some groups, and the links that leave them as stubs;
// - `sourceSpan`: the note lines a thing or link was read from;
// - `version`: the hash of the text the note's rows were built from, so a reader can refuse rows that are stale;
// - `find`: things by name or by a property's value, each with its group.
// A thing's id is its key as readNote gives it. Its group is the one scale-groups.ts puts it in.
import { sha256 } from './ai-digest.ts';
import { json, noteRows, PAGE_MOST } from './mesh-index-rows.ts';
import type { BetweenRow, GroupRow, LinkRow, MeshBackend, Page, Span, ThingRow } from './mesh-index-rows.ts';

export { memoryBackend, sqliteBackend } from './mesh-index-backends.ts';
export type { SqlEngine } from './mesh-index-backends.ts';
export { noteRows, PAGE_MOST } from './mesh-index-rows.ts';
export type { BetweenRow, GroupRow, LinkRow, MeshBackend, NoteRows, Page, Span, ThingRow } from './mesh-index-rows.ts';

/** What a thing a find found: its key, its graph and its group. */
export interface Found {
  graph: string;
  key: string;
  group: string;
}

/** A page of rows after `after`, at most `limit`. */
function paged<T extends { key: string }>(rows: T[], page: Page): T[] {
  const start = page.after === undefined ? 0 : rows.findIndex((r) => r.key === page.after) + 1;
  return rows.slice(start, start + (page.limit ?? PAGE_MOST));
}

/** The index over a backend: notes go in as text and come out as rows, by the reads a drawing needs. */
export class MeshIndex {
  readonly backend: MeshBackend;

  constructor(backend: MeshBackend) {
    this.backend = backend;
  }

  /** Reads a note's text into the index, in place of what it had. Text the index already holds is not read again. */
  update(note: string, text: string): void {
    if (this.backend.version(note) === sha256(text)) return;
    this.backend.put(noteRows(note, text));
  }

  /** Takes a note out, as when it is deleted. */
  remove(note: string): void {
    this.backend.drop(note);
  }

  /** Drops everything and builds the index again from the notes' text, in path order. */
  rebuild(notes: Record<string, string>): void {
    for (const note of this.backend.notes()) this.backend.drop(note);
    for (const note of Object.keys(notes).sort()) this.backend.put(noteRows(note, notes[note] ?? ''));
  }

  /** The hash of the text a note's rows were built from, or null when the index does not hold the note. */
  version(note: string): string | null {
    return this.backend.version(note);
  }

  /** Each group of a note's graphs, and the links between groups counted. */
  groups(note: string): { groups: GroupRow[]; between: BetweenRow[] } {
    return this.backend.groups(note);
  }

  /** The things in some groups, a page at a time, the links inside them, and the links leaving them as stubs. */
  inGroups(
    note: string,
    groups: readonly string[],
    page: Page = {},
  ): { things: ThingRow[]; links: LinkRow[]; stubs: { from: string; to: string; toGroup: string; type: string }[] } {
    const wanted = new Set(groups);
    const things = paged(this.backend.things(note, groups), page),
      keys = new Set(things.map((t) => t.key));
    const all = this.backend.links(note).filter((l) => keys.has(l.from) || keys.has(l.to));
    const links = all.filter((l) => keys.has(l.from) && keys.has(l.to));
    const stubs = all
      .filter((l) => !(wanted.has(l.fromGroup) && wanted.has(l.toGroup)))
      .map((l) =>
        keys.has(l.from)
          ? { from: l.from, to: l.to, toGroup: l.toGroup, type: l.type }
          : { from: l.to, to: l.from, toGroup: l.fromGroup, type: l.type },
      );
    return { things, links, stubs };
  }

  /** The note lines a thing (by key) or a link (by its place among its graph's links) was read from. */
  sourceSpan(note: string, graph: string, what: string | number): Span | null {
    if (typeof what === 'number')
      return this.backend.links(note).find((l) => l.graph === graph && l.n === what)?.span ?? null;
    const { groups } = this.backend.groups(note);
    const ids = groups.filter((g) => g.graph === graph).map((g) => g.id);
    return this.backend.things(note, ids).find((t) => t.graph === graph && t.key === what)?.span ?? null;
  }

  /** Things whose text is `name`, or whose property `property` is `value`, each with its group. */
  find(note: string, query: { name?: string; property?: string; value?: unknown }, page: Page = {}): Found[] {
    const { groups } = this.backend.groups(note);
    const rows = this.backend.things(
      note,
      groups.map((g) => g.id),
    );
    // a thing's props are kept as canonical JSON, so a thing that has the property says `"name":value` in it: most are
    // ruled out by that, and only the rest are read
    const said = query.property === undefined ? '' : `${json(query.property)}:${json(query.value)}`;
    const hits = rows.filter((t) => {
      if (query.name !== undefined) return t.text === query.name || t.key === query.name;
      if (query.property === undefined || !t.props.includes(said)) return false;
      const props = JSON.parse(t.props) as Record<string, unknown>;
      return json(props[query.property]) === json(query.value);
    });
    return paged(hits, page).map((t) => ({ graph: t.graph, key: t.key, group: t.group }));
  }

  /** Every row the index holds, note by note, as JSON: what two indexes are compared by. */
  dump(): string {
    return JSON.stringify(
      this.backend.notes().map((note) => {
        const { groups, between } = this.backend.groups(note);
        return {
          note,
          version: this.backend.version(note),
          groups,
          between,
          things: this.backend.things(
            note,
            groups.map((g) => g.id),
          ),
          links: this.backend.links(note),
        };
      }),
    );
  }
}
