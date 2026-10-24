// The lenses a person can open (editor spec §33, lens_library). The editor ships ready-made lenses. A person can write
// and save a new one during a session. An AI can offer one too, but only as a proposal: it joins the list once a
// person accepts it, never before. Each lens is a Lens thing (graph-spec `lensesOf`), so saving one gives the line of
// graph text to write into the note.
import type { Graph, Value } from '@thoughtknot/graph-spec';
import gs from '@thoughtknot/graph-spec';
import { word } from './words.ts';

/** Where a lens in the library came from. */
export type LensOrigin = 'ready-made' | 'graph' | 'session';

/** One lens a person can open. */
export interface LibraryLens {
  id: string;
  name: string;
  query: string;
  altitude: string | null;
  /** The kinds its query touches, so a lens can be found by topic. */
  topics: string[];
  origin: LensOrigin;
  /** Who wrote one made in the session: a person, or an AI whose proposal a person accepted. */
  by?: 'person' | 'ai';
  /** Its certainty words, if it has any. Freshness is kept apart from these (lens-freshness.ts). */
  likelihood?: string;
}

/** A lens to write: its id, name, query and, if it likes, default altitude. */
export interface LensDraft {
  id: string;
  name: string;
  query: string;
  altitude?: string;
}

/** A lens an AI offers. It is never in the library until a person accepts it. */
export interface LensProposal {
  by: 'ai';
  lens: LensDraft;
  /** The line of graph text accepting it writes. */
  text: string;
}

const READY: readonly [string, Parameters<typeof word>[0], string][] = [
  ['ready_everything', 'lens.ready.everything', '*'],
  ['ready_decisions', 'lens.ready.decisions', 'Decision'],
  ['ready_open_questions', 'lens.ready.open-questions', "Question WHERE status == 'open'"],
  ['ready_shaky_claims', 'lens.ready.shaky-claims', "Claim WHERE status == 'contested'"],
  ['ready_risks', 'lens.ready.risks', 'Risk'],
];

/** A lens read as graph-spec reads a Lens thing, so its topics and flags are the library's own. */
function asLens(d: LensDraft) {
  const props: Record<string, Value> = { id: d.id, name: d.name, query: d.query };
  if (d.altitude !== undefined) props.altitude = d.altitude;
  const [lens] = gs.lensesOf(new gs.Graph(new Map([[d.id, [new Set(['Lens']), props]]]), []));
  return lens!;
}

/** The ready-made lenses, named in the reader's language. */
export function readyLenses(): LibraryLens[] {
  return READY.map(([id, key, query]) => {
    const name = word(key);
    return { id, name, query, altitude: null, topics: asLens({ id, name, query }).topics, origin: 'ready-made' };
  });
}

/** The library: the ready-made lenses, then the graph's own Lens things, then those written in the session. */
export function lensLibrary(graph: Graph | null, session: readonly LibraryLens[] = []): LibraryLens[] {
  const own: LibraryLens[] = graph
    ? gs.lensesOf(graph).map((l) => {
        const likelihood = graph.p(l.id).likelihood;
        return {
          id: l.id,
          name: typeof l.name === 'string' ? l.name : l.id,
          query: typeof l.query === 'string' ? l.query : '',
          altitude: typeof l.altitude === 'string' ? l.altitude : null,
          topics: l.topics,
          origin: 'graph' as const,
          ...(typeof likelihood === 'string' ? { likelihood } : {}),
        };
      })
    : [];
  return [...readyLenses(), ...own, ...session];
}

/** A value written as quoted graph text. */
const quoted = (v: string) => `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** The line of graph text that saves a lens as a Lens thing. */
export function lensText(d: LensDraft): string {
  const altitude = d.altitude === undefined ? '' : `, altitude: ${quoted(d.altitude)}`;
  return `(${d.id}:Lens {name: ${quoted(d.name)}, query: ${quoted(d.query)}${altitude}})`;
}

/**
 * A lens written in the session, by a person or by an AI whose proposal was accepted. It gives the library with it
 * added, and the line to save. Refused when its id is taken, it has no name or its query cannot be read.
 */
export function writeLens(
  library: readonly LibraryLens[],
  d: LensDraft,
  by: 'person' | 'ai' = 'person',
): { library: LibraryLens[]; lens: LibraryLens; text: string } {
  if (!/^[A-Za-z_]\w*$/.test(d.id) || library.some((l) => l.id === d.id))
    throw new Error(`refused: the lens id ${d.id} is taken or not a name (editor spec §33)`);
  const read = asLens(d);
  const bad = read.flags.find(([code]) => code === 'lens-unnamed' || code === 'query-unreadable');
  if (bad) throw new Error(`refused: the lens ${d.id} cannot be saved: ${bad[0]} (editor spec §33)`);
  const lens: LibraryLens = {
    id: d.id,
    name: d.name,
    query: d.query,
    altitude: d.altitude ?? null,
    topics: read.topics,
    origin: 'session',
    by,
  };
  return { library: [...library, lens], lens, text: lensText(d) };
}

/** A lens an AI offers, as a proposal a person accepts or not. Nothing joins the library yet. */
export function proposeLens(d: LensDraft): LensProposal {
  return { by: 'ai', lens: { ...d }, text: lensText(d) };
}

/** An AI's proposal accepted by a person: the library with its lens added, and the line to save. */
export function acceptLens(library: readonly LibraryLens[], proposal: LensProposal) {
  return writeLens(library, proposal.lens, 'ai');
}
