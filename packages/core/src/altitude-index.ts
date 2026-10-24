// The altitude and topic index of a note's graphs (editor spec §32, altitude_topic_index). It is graph-spec's
// `altitudeIndex` over every graph block of the note, each entry keyed by its graph and thing. It is derived from the
// text and never written, so it can be dropped and built again at any time, and gives the same answers.
import type { AltitudeEntry, Graph } from '@thoughtknot/graph-spec';
import gs from '@thoughtknot/graph-spec';
import { sha256 } from './ai-digest.ts';

/** A note's altitude index: each entry with the graph it is in, and one hash of them all. */
export interface NoteAltitudeIndex {
  entries: (AltitudeEntry & { graph: string })[];
  hash: string;
}

/** The graphs of a note's blocks, by name. A block that cannot be read is left out. */
function graphsOf(blocks: readonly string[]): [string, Graph][] {
  const out: [string, Graph][] = [];
  for (const block of blocks) {
    const store = new gs.Store();
    try {
      const name = store.apply(block);
      const g = gs.worldFromStore(store)[name];
      if (g) out.push([name, g]);
    } catch {
      // a block the reader cannot read has no entries; its problem is shown where it is written
    }
  }
  return out;
}

/** The index of a note's graph blocks, built from their text. */
export function altitudeIndexOf(blocks: readonly string[]): NoteAltitudeIndex {
  const entries = graphsOf(blocks).flatMap(([graph, g]) =>
    gs.altitudeIndex(g).entries.map((e) => ({ ...e, id: `${graph}/${e.id}`, graph })),
  );
  return { entries, hash: gs.named(sha256(gs.jcs(entries))) };
}

/** A search of a note's index: by tag, by likeness, by lens and level or by profile, ranked by certainty. */
export function searchAltitude(index: NoteAltitudeIndex, query: Parameters<typeof gs.searchIndex>[1] = {}) {
  return gs.searchIndex(index, query);
}
