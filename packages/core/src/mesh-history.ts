// The graph mesh's history and its log (editor spec §29). Each change to a note, AI query, bundle applied and join
// is logged, with where it came from and when (changes_logged_with_provenance). Each note's
// text is kept as it was after each change, so the mesh can be seen as it was at any time. That is how a person sees
// the graph as it was before a join, and asks when a claim became contested (history_before_join).
//
// It is a ChangeLog, so the storage's history layer (note-storage.ts, historyLayer) can feed it each change it makes.
// Its clock is handed in, so a test or a host decides what time it is.
import gs from '@thoughtknot/graph-spec';
import type { MeshJoin } from '@thoughtknot/graph-spec';
import type { ChangeLog, StoredChange } from './note-storage.ts';
import { gqlBlocks } from './fences.ts';

/** What a log entry records. */
export type LogKind = 'change' | 'ai-query' | 'bundle' | 'join';

/** One entry of the log: what happened, when, where it came from, and what it touched. */
export interface LogEntry {
  at: string;
  kind: LogKind;
  /** Who or what it came from: a person, a model, a plug-in or a sync. */
  source: string;
  /** The notes it touched, in path order. */
  notes: string[];
  /** For a query, its words; for a bundle, its id; for a join, the claims it left contested. */
  detail: string[];
}

/** One version of a note: its text from a time on, or null once it was deleted. */
interface Version {
  at: string;
  text: string | null;
}

/** A note's document block: the first gql block that names its document (§21), which a join reads. */
function documentBlock(text: string): string | null {
  return gqlBlocks(text).find((b) => / · document \S+/.test(b.text.split('\n')[0] ?? ''))?.text ?? null;
}

/** The mesh's history: each note's versions, and the log of everything done to the mesh. */
export class MeshHistory implements ChangeLog {
  private readonly now: () => string;
  private readonly versions = new Map<string, Version[]>();
  private readonly entries: LogEntry[] = [];

  constructor(now: () => string = () => new Date().toISOString()) {
    this.now = now;
  }

  private keep(note: string, text: string | null, at: string): void {
    (this.versions.get(note) ?? this.versions.set(note, []).get(note))?.push({ at, text });
  }

  private entry(kind: LogKind, source: string, notes: string[], detail: string[]): LogEntry {
    const entry = { at: this.now(), kind, source, notes: [...notes].sort(), detail };
    this.entries.push(entry);
    return entry;
  }

  /** A change the storage made: kept as the note's next version and logged, as by the person who made it. */
  record(change: StoredChange): void {
    const at = change.at || this.now();
    this.keep(change.path, change.after, at);
    this.entries.push({ at, kind: 'change', source: change.author ?? 'unknown', notes: [change.path], detail: [] });
  }

  /** A note written by `source`, kept and logged. */
  change(note: string, text: string | null, source: string): LogEntry {
    const entry = this.entry('change', source, [note], []);
    this.keep(note, text, entry.at);
    return entry;
  }

  /** An AI query, logged with its words and the notes it was asked about. */
  aiQuery(words: string, notes: string[], source: string): LogEntry {
    return this.entry('ai-query', source, notes, [words]);
  }

  /** A bundle of changes applied as one, by a person: each note kept, and one entry for the bundle. */
  bundle(id: string, texts: Record<string, string | null>, source: string): LogEntry {
    const entry = this.entry('bundle', source, Object.keys(texts), [id]);
    for (const [note, text] of Object.entries(texts)) this.keep(note, text, entry.at);
    return entry;
  }

  /** Each note's text as it was at `at`: the last version from then or before, and no note deleted by then. */
  textsAt(at: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const note of [...this.versions.keys()].sort()) {
      const kept = (this.versions.get(note) ?? []).filter((v) => v.at <= at).at(-1);
      if (kept && kept.text !== null) out[note] = kept.text;
    }
    return out;
  }

  /** The notes joined as the mesh joins them, as they were at `at` (the current texts when not given). */
  joinAt(notes: string[], at = this.now()): MeshJoin {
    const texts = this.textsAt(at);
    const docs = notes.flatMap((n) => {
      const block = texts[n] === undefined ? null : documentBlock(texts[n]);
      return block === null ? [] : [block];
    });
    return gs.meshJoin({ docs });
  }

  /** The notes joined now, and the join logged with the claims it leaves contested. */
  join(notes: string[], source: string): MeshJoin {
    const joined = this.joinAt(notes);
    const contested = joined.claims.filter((c) => c.status === 'contested').map((c) => c.id);
    this.entry('join', source, notes, contested);
    return joined;
  }

  /** When a claim first became contested: the time of the first join that left it so, or null if none did. */
  contestedSince(claim: string): string | null {
    return this.entries.find((e) => e.kind === 'join' && e.detail.includes(claim))?.at ?? null;
  }

  /** The time of the last join before `at`, or null: what "before the join" means to a person looking back. */
  lastJoinBefore(at: string): string | null {
    return (
      this.entries
        .filter((e) => e.kind === 'join' && e.at < at)
        .map((e) => e.at)
        .at(-1) ?? null
    );
  }

  /** The whole log, oldest first. */
  log(): LogEntry[] {
    return this.entries.map((e) => ({ ...e, notes: [...e.notes], detail: [...e.detail] }));
  }
}
