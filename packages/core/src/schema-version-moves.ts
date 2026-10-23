// A graph moved to another version of the shared schema it names (editor spec §27, schema_version_moves; risk ARCH-4).
// A graph keeps the version its graph line names, such as decision@1, even when decision@2 exists. A move is offered as
// a change a person applies: its graph line with the new version, and what that version adds and drops. Nothing here
// writes a note, and reading a note never moves it.
import type { Graph } from '@thoughtknot/graph-spec';
import gs from '@thoughtknot/graph-spec';
import { firstLine } from './blocks.ts';
import { sharedSchemaName } from './standard-schemas.ts';
import { N, S } from './whitespace.ts';

const NAMES = new RegExp(`·${S}*schema${S}+(${N}+)`);
const base = (name: string) => name.replace(/@[^@]*$/, '');
const version = (name: string) => Number(/@(\d+)$/.exec(name)?.[1] ?? NaN);

/** A move of one block to another version of its schema: the block's new text, and what changed. */
export interface SchemaMove {
  from: string;
  to: string;
  /** The block with its graph line naming `to`. No other line changes. */
  text: string;
  /** The types `to` declares that `from` does not, and those it no longer declares. */
  adds: string[];
  drops: string[];
  /** The dropped types this block uses, so a person sees what goes unchecked. */
  used: string[];
}

/** The types a shared schema block declares, by name. */
function typesOf(schema: string): Set<string> {
  const store = new gs.Store();
  store.apply(schema);
  const g = (gs.worldFromStore(store) as { __schemas?: Record<string, Graph> }).__schemas?.[
    sharedSchemaName(schema) ?? ''
  ];
  return new Set(g ? g.labelled('ElementType').map((id) => String(g.p(id).name)) : []);
}

/** The node labels and link types a data block uses; none for a block that cannot be read. */
function usedIn(block: string): Set<string> {
  const store = new gs.Store();
  let g: Graph | undefined;
  try {
    const graph = store.apply(block);
    g = gs.worldFromStore(store)[graph];
  } catch {
    return new Set();
  }
  if (!g) return new Set();
  return new Set([...[...g.nodes.values()].flatMap(([labels]) => [...labels]), ...g.edges.map((e) => e[1])]);
}

/** Each version there is of the schema `name` belongs to, among the shared schema blocks, oldest first. */
export function schemaVersions(name: string, schemas: readonly string[]): string[] {
  const all = schemas.map(sharedSchemaName).filter((s): s is string => !!s && base(s) === base(name));
  return [...new Set(all)].sort((a, b) => version(a) - version(b) || (a < b ? -1 : 1));
}

/**
 * The block moved to version `to` of the schema its graph line names, as a change to offer a person. Null when the
 * block names no schema, already names `to`, or `to` is not another version of the same schema there is.
 */
export function schemaMove(block: string, to: string, schemas: readonly string[]): SchemaMove | null {
  const line = firstLine(block),
    m = NAMES.exec(line),
    from = m?.[1];
  if (!m || !from || from === to || base(from) !== base(to)) return null;
  const old = schemas.find((s) => sharedSchemaName(s) === from),
    next = schemas.find((s) => sharedSchemaName(s) === to);
  if (!next) return null;
  const before = old ? typesOf(old) : new Set<string>(),
    after = typesOf(next);
  const start = block.indexOf(line) + (m.index ?? 0) + m[0].length - from.length;
  const sorted = (xs: Iterable<string>) => [...xs].sort();
  const drops = sorted([...before].filter((t) => !after.has(t)));
  const uses = usedIn(block);
  return {
    from,
    to,
    text: block.slice(0, start) + to + block.slice(start + from.length),
    adds: sorted([...after].filter((t) => !before.has(t))),
    drops,
    used: drops.filter((t) => uses.has(t)),
  };
}
