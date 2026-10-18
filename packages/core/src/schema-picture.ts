// A block that holds only a schema, drawn as the schema itself (spec §3, schema_drawn). Each kind of thing is a box.
// Each relationship type is an arrow from the kinds it joins in the data to the kinds it reaches. A type the data does
// not use yet is a box of its own. The picture is a graph of its own, written as GQL and read as any block is, never
// the note.
import gs from '@thoughtknot/graph-spec';
import type { Graph } from '@thoughtknot/graph-spec';
import { graphOf, isSharedSchema } from './blocks.ts';
import { readNote } from './drawing.ts';
import type { NoteReading } from './note-reading.ts';
import { N, S } from './whitespace.ts';

/** A schema block's picture: the graph it is drawn as, and that graph read, ready to draw. */
export interface SchemaPicture {
  graph: string;
  reading: NoteReading;
}

const SHARED_NAME = new RegExp(`·${S}*SCHEMA${S}+(${N}+)`);
const q = (s: string): string => gs.quote(s);
const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Whether every thing of a graph is the schema's own, and it declares at least one type. */
function onlySchema(g: Graph | undefined): g is Graph {
  const hidden = new Set(gs.SCHEMA_LABELS);
  return (
    !!g &&
    g.labelled('ElementType').length > 0 &&
    [...g.nodes.values()].every(([labels]) => [...labels].some((l) => hidden.has(l)))
  );
}

/**
 * The picture of block `index` of a note's blocks `texts`, when it holds only a schema and is read whole. The schema is
 * a graph's own, or a shared one. Null for any other block, which is drawn as its graph. The relationship types are
 * joined by the kinds the graph's data, across the note, links with them. `shared` is the vault's shared schema blocks.
 */
export function schemaPicture(texts: string[], index: number, shared: string[] = []): SchemaPicture | null {
  const block = texts[index];
  if (block === undefined) return null;
  const graph = graphOf(block);
  // a block that declares no type is never a schema: found without reading it, as every graph block is asked (§9)
  if (!graph || !block.includes('ElementType')) return null;
  const alone = readNote([block]);
  if (alone.tooLarge || alone.problems.some((p) => p.severity === 'error')) return null;
  const sharedName = isSharedSchema(block) ? SHARED_NAME.exec(block)?.[1] : undefined;
  const schema = sharedName
    ? (alone.world as { __schemas?: Record<string, Graph> }).__schemas?.[sharedName]
    : alone.world[graph];
  if (!onlySchema(schema)) return null;
  const data = sharedName ? undefined : readNote(texts, texts.length - 1, shared).whole[graph];
  return { graph, reading: readNote([pictureText(graph, schema, data)]) };
}

/** The picture as GQL: a box for each kind, an arrow for each pair of kinds a type joins, and its own small schema. */
function pictureText(graph: string, schema: Graph, data: Graph | undefined): string {
  const declared = schema.labelled('ElementType').sort(byCode);
  const kinds = new Map<string, string>(); // kind name -> its declaration's id
  const types = new Map<string, { id: string; reading: string; reverse: string }>();
  for (const id of declared) {
    const t = schema.p(id);
    if (typeof t.name !== 'string') continue;
    if (t.kind === 'node' && t.marker !== true) kinds.set(t.name, id);
    if (t.kind === 'edge') {
      const [r, back] =
        typeof t.reading === 'string' && t.reading
          ? [t.reading, typeof t.reverse_name === 'string' ? t.reverse_name : gs.reverseReading(t.reading)]
          : gs.guessReadings(t.name);
      types.set(t.name, { id, reading: r, reverse: back });
    }
  }
  // each pair of kinds a type joins in the data, once, in order
  const joins = new Set<string>();
  const kindsOf = (g: Graph, i: string) => [...(g.nodes.get(i)?.[0] ?? [])].filter((l) => kinds.has(l)).sort(byCode);
  for (const [s, type, d] of data?.edges ?? [])
    if (types.has(type))
      for (const a of kindsOf(data as Graph, s))
        for (const b of kindsOf(data as Graph, d)) joins.add(JSON.stringify([kinds.get(a), type, kinds.get(b)]));
  const used = new Set([...joins].map((j) => (JSON.parse(j) as string[])[1]));
  // the picture's own schema takes ids the schema does not use
  const taken = new Set(schema.nodes.keys());
  const id = (want: string) => {
    let v = want,
      n = 1;
    while (taken.has(v)) v = `${want}_${++n}`;
    taken.add(v);
    return v;
  };
  const meta = id('picture_meta'),
    own = [id('picture_kind'), id('picture_relationship')];
  const typeIds = [...types.keys()].filter((t) => used.has(t)).map((t) => [t, id(`picture_${t.toLowerCase()}`)]);
  const declare = (i: string, name: string, kind: string, words = '') =>
    `(${i}:Meta:ElementType {name: ${q(name)}, kind: ${q(kind)}, origin: 'source'${words}})`;
  const body = [
    ...[...kinds].map(([name, i]) => `(${i}:Kind {name: ${q(name)}})`),
    ...[...types]
      .filter(([t]) => !used.has(t))
      .map(([, t]) => `(${t.id}:Relationship {name: ${q(`${t.reading} (not used yet)`)}})`),
    ...[...joins].sort(byCode).map((j) => {
      const [a, type, b] = JSON.parse(j) as string[];
      return `(${a})-[:${type}]->(${b})`;
    }),
    `(${meta}:GraphMeta {graph: ${q(graph)}, schema: ${q(`${graph}-picture@1`)}})`,
    declare(own[0] as string, 'Kind', 'node'),
    declare(own[1] as string, 'Relationship', 'node'),
    ...typeIds.map(([t, i]) => {
      const w = types.get(t as string) as { reading: string; reverse: string };
      return declare(i as string, t as string, 'edge', `, reading: ${q(w.reading)}, reverse_name: ${q(w.reverse)}`);
    }),
    ...[...own, ...typeIds.map(([, i]) => i as string)].map((i) => `(${meta})-[:DECLARES]->(${i})`),
  ];
  return [`// graph: ${graph}`, body.join(',\n')].join('\n');
}
