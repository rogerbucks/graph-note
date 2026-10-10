// What a note's graph blocks draw (spec §3) — the boxes and links of each graph, chosen as graph-spec-draw.py chooses
// them, so the core's layout source matches graph_svg.py's (spec §12). A graph with problems is still drawn: a path
// that cannot be read is left out, the rest of its block is drawn, and what was left out is listed as a problem.
import gs from '@graph-note/graph-spec';
import type { Graph, World } from '@graph-note/graph-spec';
import { estimate } from './estimates.ts';
import type { GraphDrawing, NoteReading, Problem } from './note-reading.ts';
import { readBlocks, REREAD_BUDGET } from './partial-read.ts';
import { textTooLarge } from './layout-limits.ts';
import { dataKind } from './blocks.ts';
import { undeclared, undeclaredUse } from './schema-checks.ts';

/** A thing's text: its name, else its title, text or label, else its id — as graph-spec-draw.py chooses. */
function textOf(g: Graph, id: string): string {
  const p = g.p(id);
  for (const k of ['name', 'title', 'text', 'label']) {
    const v = p[k];
    if (typeof v === 'string' && v) return v;
  }
  return id;
}

const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function drawingOf(world: World, name: string, own: Graph | undefined, problems: Problem[]): GraphDrawing {
  const g = world[name] as Graph;
  const hidden = new Set(gs.SCHEMA_LABELS);
  const shared = g.labelled('ElementType').length ? undefined : (gs.schemaFor(world, name)[1] ?? own);
  const readings = gs.readings(g, shared);
  const ids = [...g.nodes.keys()].filter((i) => ![...(g.nodes.get(i)?.[0] ?? [])].some((l) => hidden.has(l)));
  const drawn = new Set(ids);
  // a thing written without a name is drawn under the name suggested for it, and marked so until the name is written (§4)
  const suggested = new Map(
    problems.flatMap((p) =>
      p.graph === name && p.suggested && p.insert
        ? [[p.suggested, { block: p.block, line: p.insert.line, character: p.insert.character }] as const]
        : [],
    ),
  );
  return {
    graph: name,
    boxes: ids.map((key) => {
      const place = suggested.get(key);
      return {
        key,
        kind: [...(g.nodes.get(key)?.[0] ?? [])]
          .filter((l) => !hidden.has(l))
          .sort(byCode)
          .join(' · '),
        text: textOf(g, key),
        ...(place ? { suggested: place } : {}),
      };
    }),
    links: g.edges
      .filter(([s, , d]) => drawn.has(s) && drawn.has(d))
      .map(([from, type, to]) => ({ from, type, reading: gs.word(readings, type), to })),
    estimates: [],
  };
}

/**
 * What a note's graph blocks draw, as built by the blocks up to and including block `upTo` (default: all of them).
 * Readings come from each graph's own schema anywhere in the note — a schema is written last — else the shared schema
 * it names, from `shared` (the vault's SCHEMA blocks). Problems are listed for the blocks up to `upTo`. `budget` caps
 * reading a broken block again (partial-read.ts), as the Python reader's does.
 */
export function readNote(
  blocks: string[],
  upTo = blocks.length - 1,
  shared: string[] = [],
  budget = REREAD_BUDGET,
): NoteReading {
  const upto = blocks.slice(0, upTo + 1);
  // measured before anything is read, so no block, however large or broken, holds the page while it is read (§9): the
  // graph blocks and the shared schemas, which are read; never a query or an excerpt, which are not. The plugin's own
  // exception to drawing as the Python reader does (drawn_in_part): over the limits it draws nothing at all.
  const tooLarge = textTooLarge([...blocks.filter((b) => typeof dataKind(b) === 'string'), ...shared]);
  if (tooLarge) return { graphs: new Map(), problems: [], world: {}, whole: {}, texts: upto, tooLarge };
  const { store, problems } = readBlocks(upto, shared, budget);
  const world = gs.worldFromStore(store);
  const whole = upTo >= blocks.length - 1 ? world : gs.worldFromStore(readBlocks(blocks, shared, budget).store);
  const graphs = new Map<string, GraphDrawing>();
  for (const name of Object.keys(world)) {
    const own = whole[name]?.labelled('ElementType').length ? whole[name] : undefined;
    const d = drawingOf(world, name, own, problems);
    const shared = (world[name] as Graph).labelled('ElementType').length
      ? undefined
      : (gs.schemaFor(world, name)[1] ?? own);
    d.estimates = estimate(world[name] as Graph, name, d, shared, problems, upto);
    graphs.set(name, d);
  }
  problems.push(...undeclared(whole, upto), ...undeclaredUse(whole, upto, problems));
  problems.sort((a, b) => a.block - b.block || a.line - b.line);
  return { graphs, problems, world, whole, texts: upto };
}
