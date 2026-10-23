// A note too big to read at once, opened from the local store (editor spec §53, scale_in_parts; way E, step 7). The
// store reads the note in parts (note-parts.ts). Each graph comes back as the overview (massive-view.ts) draws it:
// its things' keys, kinds and texts, its links, and each thing's properties. Only these rows are held, never a
// reading of the note's text.
//
// The rows are refused when they were built from other text than the note has now, so a stale store is never drawn.
// The note is read a part at a time, with the page's own work done between parts.
import { sha256 } from './ai-digest.ts';
import { noteRowsPaced } from './mesh-index-rows.ts';
import type { MeshIndex } from './mesh-index.ts';
import type { GraphDrawing } from './note-reading.ts';

/** One graph of a note as the store gives it: a drawing to show as its overview, and each thing's properties. */
export interface StoredGraph {
  drawing: GraphDrawing;
  props: (key: string) => Readonly<Record<string, unknown>>;
}

/**
 * The graphs of a note, from the store. The note is read into the store first, if the store does not hold this text.
 * A huge note is read a part at a time. Between parts it waits on `pause`, which the host gives, so the page keeps
 * answering (§9). Empty
 * when no graph of it could be read, or the note changed while it was read.
 */
export async function storedGraphs(
  ix: MeshIndex,
  note: string,
  text: string,
  pause: () => Promise<void>,
): Promise<Map<string, StoredGraph>> {
  if (ix.version(note) !== sha256(text)) ix.backend.put(await noteRowsPaced(note, text, pause));
  const out = new Map<string, StoredGraph>();
  if (ix.version(note) !== sha256(text)) return out;
  const { groups } = ix.groups(note);
  const byGraph = new Map<string, string[]>();
  for (const g of groups) byGraph.set(g.graph, [...(byGraph.get(g.graph) ?? []), g.id]);
  const links = ix.backend.links(note);
  for (const [graph, ids] of byGraph) {
    const things = ix.backend.things(note, ids).filter((t) => t.graph === graph);
    const props = new Map(things.map((t) => [t.key, t.props]));
    const parsed = new Map<string, Record<string, unknown>>();
    out.set(graph, {
      drawing: {
        graph,
        boxes: things.map((t) => ({ key: t.key, kind: t.kind, text: t.text })),
        links: links
          .filter((l) => l.graph === graph)
          .map((l) => ({ from: l.from, type: l.type, reading: l.reading, to: l.to })),
        estimates: [],
      },
      // read from its JSON only when a filter asks for it
      props: (key) => {
        if (!parsed.has(key)) parsed.set(key, JSON.parse(props.get(key) ?? '{}') as Record<string, unknown>);
        return parsed.get(key) ?? {};
      },
    });
  }
  return out;
}
