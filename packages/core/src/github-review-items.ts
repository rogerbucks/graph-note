// Pull requests, merges and commits as items to review (editor spec §41, github_review_items): the repository a note lives
// in lists its changes as items, each opening in the changes view, so the user and Claude can review a change together.
// A review goes down in levels: first a summary by section, workstream and requirement, then each graph's things and
// links added, removed or changed, then every line. The core reaches no network: the host hands in a `ReviewSource`
// that reads GitHub with its own sign-in, read only, and nothing is asked of it until the user asks.
import type { Value } from '@graph-note/graph-spec';
import { gqlBlocks } from './blocks.ts';
import { changesView } from './changes-view.ts';
import type { ChangesShown } from './changes-view.ts';
import { readNote } from './drawing.ts';
import { lineDiff } from './line-diff.ts';
import type { DiffLine } from './line-diff.ts';
import type { MarkKind } from './proposals-marks.ts';

/** One change in the repository, as an item: a pull request, a merge or a commit. */
export interface ReviewItem {
  kind: 'pull' | 'merge' | 'commit';
  /** The pull request's number, or the commit's full id. */
  id: string;
  title: string;
  author?: string;
  /** When it was opened, merged or made, as the host read it. */
  when?: string;
  /** Where it is on GitHub, for the host to offer as a link. */
  url?: string;
}

/** A file an item changed: its path, and its text before and after (null where the file did not exist). */
export interface ChangedFile {
  path: string;
  before: string | null;
  after: string | null;
}

/** What a host hands in to read the repository: both read only, and called only when the user asks. */
export interface ReviewSource {
  items(): Promise<ReviewItem[]>;
  files(item: ReviewItem): Promise<ChangedFile[]>;
}

/** The groups a summary is made by: each workstream's title and the things (by key) it holds. */
export type Workstreams = Map<string, { title: string; members: Set<string> }>;

/** One group of a summary: its name, and how many things it saw added, changed and removed, and which. */
export interface SummaryGroup {
  name: string;
  add: number;
  change: number;
  remove: number;
  keys: string[];
}

/** One graph a file holds, ready to open in the changes view. */
export interface GraphChanges {
  path: string;
  graph: string;
  shown: ChangesShown;
}

/** One file's lines; null where too many changed to show line by line. */
export interface FileLines {
  path: string;
  lines: DiffLine[] | null;
}

/** An item reviewed, at every level: the summary, the graphs' changes, and the lines. */
export interface ReviewLevels {
  /** Level 1: by section, by workstream, and each requirement changed, with the files that hold no graph counted. */
  summary: {
    sections: SummaryGroup[];
    workstreams: SummaryGroup[];
    requirements: { key: string; mark: MarkKind; said: string }[];
    otherFiles: number;
  };
  /** Level 2: each graph's things and links added, removed and changed, each opening in the changes view. */
  graphs: GraphChanges[];
  /** Level 3: every line of every file. */
  lines: FileLines[];
}

/** The level names, from the highest down. */
export const REVIEW_LEVELS = ['summary', 'graphs', 'lines'] as const;

/** A file read as a note: a Markdown note as it is, a `.gql` file as the one block it is. */
export function asNote(path: string, text: string): string {
  return /\.gql$/i.test(path) ? '```gql\n' + text.replace(/\n$/, '') + '\n```\n' : text;
}

/** A file whose graphs are read: a note or a graph file. */
const readable = (path: string) => /\.(md|gql)$/i.test(path);

/** The workstreams of a `workstreams.json` as the repository keeps it: each id's title and the requirements it holds. */
export function workstreamsFrom(json: string): Workstreams {
  const out: Workstreams = new Map();
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return out;
  }
  if (!data || typeof data !== 'object') return out;
  for (const [id, w] of Object.entries(data as Record<string, unknown>)) {
    const { title, requirements } = (w ?? {}) as { title?: unknown; requirements?: unknown };
    if (typeof title !== 'string' || !Array.isArray(requirements)) continue;
    out.set(id, { title: `${id} · ${title}`, members: new Set(requirements.filter((r) => typeof r === 'string')) });
  }
  return out;
}

const bump = (groups: Map<string, SummaryGroup>, name: string, mark: MarkKind, key: string) => {
  const g = groups.get(name) ?? { name, add: 0, change: 0, remove: 0, keys: [] };
  g[mark]++;
  if (!g.keys.includes(key)) g.keys.push(key);
  groups.set(name, g);
};

/** The sections of a note's graphs: each Section's number and its title, as the requirements write them. */
function sectionTitles(notes: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const note of notes) {
    const world = readNote(gqlBlocks(note).map((b) => b.text)).world;
    for (const g of Object.values(world))
      for (const key of g.labelled('Section')) {
        const p = g.p(key);
        if (typeof p.num === 'string') out.set(p.num, typeof p.title === 'string' ? `${p.num} · ${p.title}` : p.num);
      }
  }
  return out;
}

/**
 * An item's changed files reviewed at every level. A thing's section is its `section` property, named by the Section
 * of that number where one is written; a thing's workstreams are those `workstreams` lists it in; a requirement is a
 * thing of kind Requirement. Files that hold no graph are counted in the summary and shown at the level of lines.
 */
export function reviewLevels(files: readonly ChangedFile[], workstreams: Workstreams = new Map()): ReviewLevels {
  const sections = new Map<string, SummaryGroup>(),
    streams = new Map<string, SummaryGroup>();
  const requirements: ReviewLevels['summary']['requirements'] = [];
  const graphs: GraphChanges[] = [];
  const lines: FileLines[] = [];
  let otherFiles = 0;
  for (const f of files) {
    lines.push({ path: f.path, lines: lineDiff(f.before ?? '', f.after ?? '') });
    if (!readable(f.path)) {
      otherFiles++;
      continue;
    }
    const before = asNote(f.path, f.before ?? ''),
      after = asNote(f.path, f.after ?? '');
    const old = readNote(gqlBlocks(before).map((b) => b.text));
    const now = readNote(gqlBlocks(after).map((b) => b.text));
    const names = [...new Set([...now.graphs.keys(), ...old.graphs.keys()])];
    if (!names.length) otherFiles++;
    const titles = sectionTitles([before, after]);
    for (const graph of names) {
      const shown = changesView(before, after, graph);
      if (!shown.changes.length) continue;
      graphs.push({ path: f.path, graph, shown });
      for (const c of shown.changes) {
        if (c.on !== 'thing') continue;
        const key = c.id.slice('thing:'.length);
        const props: Record<string, Value> =
          (c.mark === 'remove' ? old.world[graph]?.p(key) : now.world[graph]?.p(key)) ?? {};
        const section = typeof props.section === 'string' ? props.section : null;
        if (section) bump(sections, titles.get(section) ?? section, c.mark, key);
        for (const w of workstreams.values()) if (w.members.has(key)) bump(streams, w.title, c.mark, key);
        const kinds = (shown.reading.graphs.get(graph)?.boxes.find((b) => b.key === key)?.kind ?? '').split(' · ');
        if (kinds.includes('Requirement')) requirements.push({ key, mark: c.mark, said: c.said });
      }
    }
  }
  const sorted = (m: Map<string, SummaryGroup>) =>
    [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  return {
    summary: { sections: sorted(sections), workstreams: sorted(streams), requirements, otherFiles },
    graphs,
    lines,
  };
}

/** A group said in a line: "41 · Every surface…: 2 added, 1 changed". */
export function groupSaid(g: SummaryGroup): string {
  const parts = [
    g.add ? `${g.add} added` : '',
    g.change ? `${g.change} changed` : '',
    g.remove ? `${g.remove} removed` : '',
  ];
  return `${g.name}: ${parts.filter(Boolean).join(', ')}`;
}

/**
 * The repository's changes as items to review, read through `source` only when asked: `list` the first time it is
 * called, `review` for one item when it is opened. Each is read once and kept, so going up and down the levels reads
 * nothing again.
 */
export class ReviewItems {
  private readonly source: ReviewSource;
  private listed: Promise<ReviewItem[]> | null = null;
  private readonly reviewed = new Map<string, Promise<ReviewLevels>>();
  private readonly workstreams: Workstreams;

  constructor(source: ReviewSource, workstreams: Workstreams = new Map()) {
    this.source = source;
    this.workstreams = workstreams;
  }

  /** The items, newest first as the host lists them: asked of the source the first time only. */
  list(): Promise<ReviewItem[]> {
    // a read that fails is not kept, so asking again reads again
    this.listed ??= this.source.items().catch((e: unknown) => {
      this.listed = null;
      throw e;
    });
    return this.listed;
  }

  /** One item reviewed at every level: its files asked of the source when it is first opened. */
  review(item: ReviewItem): Promise<ReviewLevels> {
    const key = `${item.kind}:${item.id}`;
    let r = this.reviewed.get(key);
    if (!r) {
      r = this.source
        .files(item)
        .then((files) => reviewLevels(files, this.workstreams))
        .catch((e: unknown) => {
          this.reviewed.delete(key);
          throw e;
        });
      this.reviewed.set(key, r);
    }
    return r;
  }
}
