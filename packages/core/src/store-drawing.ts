// A note too big to read at once, opened from the local store (editor spec §53, scale_in_parts; way E, step 7). The
// store reads the note in parts (note-parts.ts). Each graph comes back as the overview (massive-view.ts) draws it:
// its things' keys, kinds and texts, its links, and each thing's properties. Only these rows are held, never a
// reading of the note's text.
//
// The rows are refused when they were built from other text than the note has now, so a stale store is never drawn.
// The note is read a part at a time, with the page's own work done between parts.
//
// An edit is written to the note's text first, never to the store. The text stays the only store of the graph
// (text_is_the_store). Only the lines that wrote the thing are edited, so the note is never read whole. The host
// writes the new text to the note, and the store then reads the changed note again.
import gs from '@thoughtknot/graph-spec';
import { sha256 } from './ai-digest.ts';
import { gqlBlocks } from './fences.ts';
import type { Edit } from './inspector.ts';
import { noteRowsPaced } from './mesh-index-rows.ts';
import type { MeshIndex } from './mesh-index.ts';
import type { GraphDrawing, Problem } from './note-reading.ts';
import { readStyle } from './style.ts';
import type { StyleGraph } from './style-graph.ts';
import { word } from './words.ts';

/** One graph of a note as the store gives it: a drawing to show as its overview, and each thing's properties. */
export interface StoredGraph {
  drawing: GraphDrawing;
  props: (key: string) => Readonly<Record<string, unknown>>;
  /** Its things and links as the style checks read a graph: each thing by its kind, each link without properties. */
  world: () => gs.Graph;
}

/** A graph as the graph library's rules read one, from things (key, kind, properties) and links. */
function plainGraph(things: [string, string, Record<string, gs.Value>][], edges: gs.Edge[]): gs.Graph {
  const nodes = new Map(
    things.map(([key, kind, props]) => [key, [new Set([kind]), props] as [Set<string>, typeof props]]),
  );
  return {
    nodes,
    edges,
    labelled: (label) => [...nodes].filter(([, [labels]]) => labels.has(label)).map(([key]) => key),
    p: (id) => nodes.get(id)?.[1] ?? {},
    has: (id, label) => !!nodes.get(id)?.[0].has(label),
    out: (id, type) => edges.filter((e) => e[0] === id && (type === undefined || e[1] === type)),
    inc: (id, type) => edges.filter((e) => e[2] === id && (type === undefined || e[1] === type)),
  };
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
      world: () =>
        plainGraph(
          things.map((t) => [t.key, t.kind, JSON.parse(t.props) as Record<string, gs.Value>]),
          links.filter((l) => l.graph === graph).map((l) => [l.from, l.type, l.to, {}]),
        ),
    });
  }
  return out;
}

/**
 * The note's new text, after `change` edits the lines that wrote thing `key` in `graph`. `change` is given those lines
 * and gives them back edited, as setProperty in inspector.ts does. Refused when the store was read from other text
 * than `text`, so an edit never lands on the wrong lines.
 */
export function editInParts(
  ix: MeshIndex,
  note: string,
  text: string,
  graph: string,
  key: string,
  change: (lines: string) => Edit,
): Edit {
  if (ix.version(note) !== sha256(text)) return { ok: false, reason: word('editing.note-changed') };
  const span = ix.sourceSpan(note, graph, key);
  if (!span) return { ok: false, reason: word('editing.not-stored', { thing: key, graph }) };
  const lines = text.split('\n');
  const done = change(lines.slice(span.line - 1, span.end).join('\n'));
  if (!done.ok) return done;
  return { ok: true, text: [...lines.slice(0, span.line - 1), done.text, ...lines.slice(span.end)].join('\n') };
}

/**
 * The style of a graph of a note too big to read at once, read from its style blocks (§2). Its names are checked
 * against the graph as the store holds it, as a whole reading checks them. The note's data blocks are never read here.
 */
export function storedStyle(text: string, stored: StoredGraph): { style: StyleGraph; problems: Problem[] } {
  const graph = stored.drawing.graph;
  const world = Object.assign(Object.create(null) as Record<string, gs.Graph>, {
    [graph]: stored.world(),
  });
  return readStyle(
    gqlBlocks(text).map((b) => b.text),
    graph,
    { world, whole: Object.create(null) as typeof world },
  );
}
