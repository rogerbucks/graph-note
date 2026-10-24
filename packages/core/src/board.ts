// The board graph (editor spec §45, board_is_text and board_checked): a whiteboard kept as its own gql block in the
// note, `// graph: ideas · BOARD ON trip`. Each item is a thing of one board kind, with its place, size, text and style
// as properties; each connector is a CONNECTS link. It is read with the reader the data is read with, checked, and
// written back in one fixed form. So the note's text stays the only store, and every board edit is a change to it.
import gs from '@thoughtknot/graph-spec';
import type { Value } from '@thoughtknot/graph-spec';
import { boardOf } from './blocks.ts';
import { quoted } from './lock.ts';
import type { Problem } from './note-reading.ts';
import { readBlocks, REREAD_BUDGET } from './partial-read.ts';
import { word } from './words.ts';
import { writtenIn } from './written-things.ts';

export { boardOf };

/** The kinds of item a board holds. A plug-in may add more later (board_item_plugins). */
export const BOARD_KINDS = ['Sticky', 'Card', 'Text', 'Shape', 'Frame', 'Ink', 'Image', 'Glyph'] as const;

/** One kind of board item. */
export type BoardKind = (typeof BOARD_KINDS)[number];

/** One item on a board: its name in the block, kind, place (whole numbers) and what else it holds. */
export interface BoardItem {
  id: string;
  kind: BoardKind;
  x: number;
  y: number;
  w?: number;
  h?: number;
  /** Which items are drawn over which: higher is on top. */
  layer?: number;
  text?: string;
  /** A design token, such as 'accent', never a colour of its own. */
  style?: string;
  /** The thing of the board's graph this item became (board_graph_linked). */
  graph?: string;
  locked?: boolean;
  /** Any other property, kept as written, in the order written. */
  more: Record<string, Value>;
}

/** A connector between two items: a CONNECTS link, with its label if it has one. */
export interface Connector {
  from: string;
  to: string;
  label?: string;
}

/** A board as read from its block. */
export interface Board {
  name: string;
  /** The graph its items decompose into, or null for a free board. */
  on: string | null;
  items: BoardItem[];
  connectors: Connector[];
}

// the properties every item may have, in the order they are written
const NUMBERS = ['x', 'y', 'w', 'h', 'layer'] as const;
const TEXTS = ['text', 'style', 'graph'] as const;
const OWN = new Set<string>([...NUMBERS, ...TEXTS, 'locked']);
const KINDS = new Set<string>(BOARD_KINDS);

/**
 * The board a block holds, with its problems. `things` are the names of the things in the board's graph. Each item's
 * link is checked against them, and not checked when they are not given. `block` is the block's place in the note, for
 * the problems. Whatever can be read is on the board, so it can still be drawn; nothing is ever written to the note.
 */
export function readBoard(text: string, things?: Set<string>, block = 0): { board: Board; problems: Problem[] } {
  const line = boardOf(text);
  const board: Board = { name: line?.name ?? '', on: line?.on ?? null, items: [], connectors: [] };
  const read = readBlocks([text], [], REREAD_BUDGET, () => 'data');
  const problems: Problem[] = read.problems
    .filter((p) => p.severity !== 'hint')
    .map((p) => ({ ...p, graph: board.name, block }));
  const problem = (at: number, code: string, message: string, fix: string) =>
    problems.push({ graph: board.name, block, line: at, severity: 'error', code, message, fix });
  // the line each thing is written on, the first time it is written
  const lineOf = new Map<string, number>();
  for (const w of writtenIn(text))
    if (w.writes && w.variable && !lineOf.has(w.variable.name))
      lineOf.set(w.variable.name, text.slice(0, w.open).split('\n').length);
  const graph = gs.worldFromStore(read.store)[board.name];
  for (const [id, [labels, props]] of graph?.nodes ?? []) {
    const at = lineOf.get(id) ?? 1;
    const kind = [...labels].find((l) => KINDS.has(l));
    if (!kind || labels.size !== 1) {
      const said = [...labels].join(':') || '(none)';
      problem(
        at,
        'GN901',
        word('board.kind-unknown', { kind: said, id }),
        word('board.kind-unknown.fix', { kinds: BOARD_KINDS.join(', ') }),
      );
      continue;
    }
    const whole = (v: Value | undefined) => typeof v === 'number' && Number.isInteger(v);
    if (!whole(props.x) || !whole(props.y)) problem(at, 'GN902', word('board.place', { id }), word('board.place.fix'));
    const item: BoardItem = { id, kind: kind as BoardKind, x: placeOf(props.x), y: placeOf(props.y), more: {} };
    for (const key of NUMBERS.slice(2)) if (typeof props[key] === 'number') item[key] = Math.round(props[key]);
    for (const key of TEXTS) if (typeof props[key] === 'string') item[key] = props[key];
    if (typeof props.locked === 'boolean') item.locked = props.locked;
    // the reader gives each thing its name as id too: that is not a property of the item
    for (const [key, v] of Object.entries(props)) if (!OWN.has(key) && !(key === 'id' && v === id)) item.more[key] = v;
    if (item.graph !== undefined && things && board.on && !things.has(item.graph))
      problem(
        at,
        'GN903',
        word('board.link-gone', { id, thing: item.graph, graph: board.on }),
        word('board.link-gone.fix', { thing: item.graph, graph: board.on }),
      );
    board.items.push(item);
  }
  const held = new Set(board.items.map((i) => i.id));
  const seen = new Map<string, number>();
  for (const [from, type, to, props] of graph?.edges ?? []) {
    const nth = (seen.get(type) ?? 0) + 1;
    seen.set(type, nth);
    if (type !== 'CONNECTS') {
      problem(linkLine(text, type, nth), 'GN904', word('board.link-kind', { type }), word('board.link-kind.fix'));
      continue;
    }
    if (!held.has(from) || !held.has(to)) continue;
    const c: Connector = { from, to };
    if (typeof props.label === 'string') c.label = props.label;
    board.connectors.push(c);
  }
  problems.sort((a, b) => a.line - b.line);
  return { board, problems };
}

/** A place read as the nearest whole number; a place not written, or not a number, is 0. */
const placeOf = (v: Value | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0);

/** The line the nth link of a type is written on (1-based), or 1 when it cannot be found. */
function linkLine(text: string, type: string, nth: number): number {
  const lines = text.split('\n');
  let count = 0;
  for (let i = 0; i < lines.length; i++) if ((lines[i] ?? '').includes(`[:${type}`) && ++count === nth) return i + 1;
  return 1;
}

/** A property value written as GQL. */
function valueGql(v: Value): string {
  if (typeof v === 'string') return quoted(v);
  if (Array.isArray(v)) return `[${v.map(valueGql).join(', ')}]`;
  if (v instanceof gs.GTime) return `${v.kind.toUpperCase()} ${quoted(v.s)}`;
  return String(v);
}

/** One item written as GQL, its properties in the one fixed order: its own first, then the rest as written. */
export function itemGql(item: BoardItem): string {
  const props: string[] = [];
  for (const key of NUMBERS) if (item[key] !== undefined) props.push(`${key}: ${item[key]}`);
  for (const key of TEXTS) if (item[key] !== undefined) props.push(`${key}: ${quoted(item[key])}`);
  if (item.locked !== undefined) props.push(`locked: ${item.locked}`);
  for (const [key, v] of Object.entries(item.more)) props.push(`${key}: ${valueGql(v)}`);
  return `(${item.id}:${item.kind} {${props.join(', ')}})`;
}

/** A board written as its block, in the one fixed form: the board line, each item on a line, then each connector. */
export function writeBoard(board: Board): string {
  const head = `// graph: ${board.name} · BOARD${board.on ? ` ON ${board.on}` : ''}`;
  const lines = [
    ...board.items.map(itemGql),
    ...board.connectors.map(
      (c) => `(${c.from})-[:CONNECTS${c.label !== undefined ? ` {label: ${quoted(c.label)}}` : ''}]->(${c.to})`,
    ),
  ];
  return [head, ...lines.map((l, i) => (i < lines.length - 1 ? `${l},` : l))].join('\n');
}

/**
 * The block with one item moved to a new place, rounded to whole numbers. Only that item's own text changes, written
 * in the fixed form; everything else in the block, its notes and comments too, stays as it was. A block that does not
 * hold the item is given back as it was.
 */
export function moveItem(text: string, id: string, x: number, y: number): string {
  const item = readBoard(text).board.items.find((i) => i.id === id);
  const w = writtenIn(text).find((t) => t.writes && t.variable?.name === id);
  if (!item || !w) return text;
  const moved = itemGql({ ...item, x: Math.round(x), y: Math.round(y) });
  return text.slice(0, w.open) + moved + text.slice(w.close + 1);
}
