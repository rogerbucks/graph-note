// The inspector (editor spec §14): every property of a thing or a link, each edited, added or removed. An edit is text
// (spec §2): the property is rewritten in the map of the pattern where the thing or link is written, and nothing else in
// the block changes. A value is checked against its type before it is written, and written as the document profile writes
// it; the names already used on things of the same kind are offered first.
import type { Graph } from '@graph-note/graph-spec';
import type { NoteReading } from './note-reading.ts';
import { blockItems } from './block-items.ts';
import { hops } from './estimates.ts';
import { writtenIn } from './written-things.ts';

/** The kinds of value the document profile holds. It holds no lists. */
export type PropType = 'text' | 'number' | 'date' | 'datetime' | 'boolean';

/** A value typed in, checked against its type: written as GQL, or why it cannot be. */
export type Parsed = { ok: true; gql: string } | { ok: false; error: string };

/** A value typed in, checked against its type, and written as GQL — or why it cannot be. */
export function parseValue(type: PropType | 'list', input: string): Parsed {
  const v = input.trim();
  switch (type) {
    case 'text':
      return { ok: true, gql: `'${input.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` };
    case 'number':
      return /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v)
        ? { ok: true, gql: v }
        : { ok: false, error: 'expected a number, such as 12 or 3.5' };
    case 'date': {
      const ok =
        /^\d{4}-\d\d-\d\d$/.test(v) &&
        !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
        new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
      return ok ? { ok: true, gql: `DATE '${v}'` } : { ok: false, error: 'expected a date, written YYYY-MM-DD' };
    }
    case 'datetime': {
      const m = /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(:\d\d(\.\d{1,6})?)?(Z|[+-]\d\d:?\d\d)?$/.exec(v);
      if (!m) return { ok: false, error: 'expected a date and time, written YYYY-MM-DDTHH:MM:SS+HH:MM' };
      if (!m[3]) return { ok: false, error: 'an instant needs its offset, such as +10:00 or Z' };
      return { ok: true, gql: `DATETIME '${v}'` };
    }
    case 'boolean':
      return /^(true|false)$/i.test(v)
        ? { ok: true, gql: v.toUpperCase() }
        : { ok: false, error: 'expected true or false' };
    case 'list':
      return { ok: false, error: 'the document profile holds no lists: write one property for each value' };
  }
}

/** One property of a thing or link, as the inspector shows it. */
export interface Property {
  key: string;
  /** The value in words, as it is typed in. */
  value: string;
  type: PropType;
}

const typeOf = (v: unknown): PropType =>
  typeof v === 'number'
    ? 'number'
    : typeof v === 'boolean'
      ? 'boolean'
      : v && typeof v === 'object' && 'kind' in v
        ? (v as { kind: string }).kind === 'date'
          ? 'date'
          : 'datetime'
        : 'text';
const wordsOf = (v: unknown): string => (v && typeof v === 'object' && 's' in v ? String(v.s) : String(v));

/** A thing, by its id, or a link, by its place among the graph's links as drawn. */
export type Target = { thing: string } | { link: number };

function propsOf(g: Graph, reading: NoteReading, graph: string, t: Target): Record<string, unknown> {
  if ('thing' in t) return g.p(t.thing);
  const drawn = new Set(reading.graphs.get(graph)?.boxes.map((b) => b.key));
  return g.edges.filter(([s, , d]) => drawn.has(s) && drawn.has(d))[t.link]?.[3] ?? {};
}

/** Every property of a thing or a link, by name — a thing's id aside, which is its name. */
export function propertiesOf(reading: NoteReading, graph: string, t: Target): Property[] {
  const g = reading.world[graph];
  if (!g) return [];
  return Object.entries(propsOf(g, reading, graph, t))
    .filter(([k]) => !('thing' in t && k === 'id'))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, v]) => ({ key, value: wordsOf(v), type: typeOf(v) }));
}

/** The property names to offer: those used on things of this kind first, most used first; then the graph's others. */
export function propertyNames(reading: NoteReading, graph: string, kind: string): string[] {
  const g = reading.world[graph];
  if (!g) return [];
  // a locked graph offers only what its schema declares for the kind: ElementTypes of kind 'property', named Kind.name (§14)
  const schema = reading.whole[graph] ?? g;
  const declared = schema
    .labelled('ElementType')
    .map((i) => schema.p(i))
    .filter((t) => t.kind === 'property')
    .flatMap((t) => (typeof t.name === 'string' ? [t.name] : []));
  if (declared.length)
    return declared
      .filter((n) => n.startsWith(`${kind}.`))
      .map((n) => n.slice(kind.length + 1))
      .sort();
  const count = (ids: string[]) => {
    const n = new Map<string, number>();
    for (const i of ids) for (const k of Object.keys(g.p(i))) if (k !== 'id') n.set(k, (n.get(k) ?? 0) + 1);
    return [...n].sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1)).map(([k]) => k);
  };
  const own = count(kind ? g.labelled(kind) : []);
  return own.concat(
    count([...g.nodes.keys()])
      .filter((k) => !own.includes(k))
      .sort(),
  );
}

/** The text with strings and comments blanked to spaces of the same length, so positions hold and their contents never match. */
function blank(text: string): string {
  return text
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
    .replace(/'(?:[^'\\]|\\.)*'/g, (m) => `'${' '.repeat(m.length - 2)}'`);
}

/** An id as a regular expression matches it: each character as itself, so `node.js` never matches `node_js`. */
export const literally = (id: string): string => id.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

/** Each pattern of the (blanked) text that writes or mentions the thing: its labels in [1], its map in [2]. */
const thingPatterns = (b: string, id: string) => [
  ...b.matchAll(new RegExp(`\\(\\s*${literally(id)}\\s*((?::\\s*\\w+\\s*)*)(\\{[^{}]*\\})?\\s*\\)`, 'g')),
];
/** Each link's brackets in the (blanked) text, in order: its map in [1]. */
const linkBrackets = (b: string) => [...b.matchAll(/-\[\s*:\s*\w+\s*(\{[^{}]*\})?\s*\]/g)];

/**
 * Where an item is written in a block, as the editor shows it when the item is selected in the drawing: the pattern that
 * writes a thing (or, failing that, its first mention), or a link's brackets with its arrow. A thing drawn under a
 * suggested name (spec §4) is not written by its name: `unnamed`, the box's place just after its (, finds the pattern
 * there, if it is still one written without a name. Null when it is not here.
 */
export function spanOf(
  block: string,
  t: Target,
  unnamed?: { line: number; character: number },
): { from: number; to: number } | null {
  const b = blank(block);
  if ('thing' in t) {
    const all = thingPatterns(b, t.thing),
      m = all.find((x) => x[1] || x[2]) ?? all[0];
    if (m?.index !== undefined) return { from: m.index, to: m.index + m[0].length };
    if (!unnamed) return null;
    const lines = block.split('\n');
    if (unnamed.line >= lines.length) return null;
    const at = lines.slice(0, unnamed.line).reduce((n, l) => n + l.length + 1, 0) + unnamed.character;
    const w = writtenIn(block).find((x) => x.open === at - 1 && !x.variable);
    return w ? { from: w.open, to: w.close + 1 } : null;
  }
  const m = linkBrackets(b)[t.link];
  if (m?.index === undefined) return null;
  const from = b[m.index - 1] === '<' ? m.index - 1 : m.index,
    end = m.index + m[0].length;
  return { from, to: b.startsWith('->', end) ? end + 2 : b.startsWith('-', end) ? end + 1 : end };
}

/** A drawn link, by its place among the graph's links, as counted among the links written in this block; -1 if not here. */
export function linkInBlock(reading: NoteReading, graph: string, index: number, block: string): number {
  const l = reading.graphs.get(graph)?.links[index];
  let n = 0;
  for (const it of blockItems(block))
    for (const [s, t, e] of hops(it.text)) {
      if (l && s === l.from && t === l.type && e === l.to) return n;
      n++;
    }
  return -1;
}

/** A property edit: the block's new text, or why it cannot be made here. */
export type Edit = { ok: true; text: string } | { ok: false; reason: string };

/** A thing's or link's map in a block: where it is (or where one would go), and its entries by their spans. */
type MapAt =
  | { ok: false; reason: string }
  | {
      ok: true;
      open: number;
      close: number;
      at: number;
      entries: { from: number; to: number; key: string; colon: number }[];
    };

function mapOf(block: string, graph: string, t: Target): MapAt {
  const b = blank(block);
  let open = -1,
    close = -1,
    at = -1;
  if ('thing' in t) {
    const m = thingPatterns(b, t.thing).find((x) => x[1] || x[2]);
    if (!m || m.index === undefined)
      return {
        ok: false,
        reason: `${t.thing} is not written in this block: edit it where it is written, in graph ${graph}`,
      };
    if (m[2]) {
      open = m.index + m[0].indexOf(m[2]);
      close = open + m[2].length - 1;
    } else at = m.index + m[0].replace(/\s*\)$/, '').length;
  } else {
    const m = linkBrackets(b)[t.link];
    if (!m || m.index === undefined) return { ok: false, reason: `this block has no link number ${t.link + 1}` };
    if (m[1]) {
      open = m.index + m[0].indexOf(m[1]);
      close = open + m[1].length - 1;
    } else at = m.index + m[0].replace(/\s*\]$/, '').length;
  }
  const entries: { from: number; to: number; key: string; colon: number }[] = [];
  if (open !== -1) {
    let from = 0;
    for (const part of b.slice(open + 1, close).split(',')) {
      const k = /^\s*(\w+)\s*:/.exec(part);
      if (k)
        entries.push({
          from: open + 1 + from,
          to: open + 1 + from + part.length,
          key: k[1] ?? '',
          colon: open + 1 + from + part.indexOf(':'),
        });
      from += part.length + 1;
    }
  }
  return { ok: true, open, close, at, entries };
}

const ONE_WORD = /^[A-Za-z_]\w*$/;
const notHere = (key: string) => `${key} is not written in its pattern here: change it where it is written`;

/**
 * Sets a property — `gql` is its value as written, or null to remove it — in the pattern of this block that writes the
 * thing, or in the brackets of the block's `link`-th relationship (counted in this block). Only that map changes. A
 * property set elsewhere (by SET, or in another block) cannot be removed here, and says so.
 */
export function setProperty(block: string, graph: string, t: Target, key: string, gql: string | null): Edit {
  if ('thing' in t && key === 'id')
    return { ok: false, reason: 'the id is the thing’s name: rename the thing instead' };
  if (!ONE_WORD.test(key)) return { ok: false, reason: 'a property name is one word: letters, digits and underscores' };
  const map = mapOf(block, graph, t);
  if (!map.ok) return map;
  const { open, close, at, entries } = map;
  if (open === -1) {
    if (gql === null) return { ok: false, reason: notHere(key) };
    return { ok: true, text: `${block.slice(0, at)} {${key}: ${gql}}${block.slice(at)}` };
  }
  const e = entries.find((x) => x.key === key);
  if (e && gql !== null) {
    const vFrom =
      e.colon + 1 + (block.slice(e.colon + 1, e.to).length - block.slice(e.colon + 1, e.to).trimStart().length);
    const vTo = e.colon + 1 + block.slice(e.colon + 1, e.to).trimEnd().length;
    return { ok: true, text: block.slice(0, vFrom) + gql + block.slice(vTo) };
  }
  if (e) {
    // remove it, with the comma that parts it from its neighbour; an emptied map goes too
    if (entries.length === 1) {
      let start = open;
      while (start > 0 && /[ \t]/.test(block[start - 1] ?? '')) start--;
      return { ok: true, text: block.slice(0, start) + block.slice(close + 1) };
    }
    const i = entries.indexOf(e),
      next = entries[i + 1];
    if (next)
      return {
        ok: true,
        text:
          block.slice(0, e.from + (block.slice(e.from, e.to).length - block.slice(e.from, e.to).trimStart().length)) +
          block.slice(
            next.from + (block.slice(next.from, next.to).length - block.slice(next.from, next.to).trimStart().length),
          ),
      };
    const prev = entries[i - 1];
    return {
      ok: true,
      text:
        block.slice(0, (prev?.from ?? 0) + block.slice(prev?.from ?? 0, prev?.to ?? 0).trimEnd().length) +
        block.slice(e.to),
    };
  }
  if (gql === null) return { ok: false, reason: notHere(key) };
  const end = open + 1 + block.slice(open + 1, close).trimEnd().length;
  return { ok: true, text: `${block.slice(0, end)}${entries.length ? ', ' : ''}${key}: ${gql}${block.slice(end)}` };
}

/**
 * Renames a property in the map where it is written, keeping its value exactly as written. A name the thing or link
 * already has is refused, as renaming onto it would lose that property's value.
 */
export function renameProperty(block: string, graph: string, t: Target, from: string, to: string): Edit {
  if ('thing' in t && (from === 'id' || to === 'id'))
    return { ok: false, reason: 'the id is the thing’s name: rename the thing instead' };
  if (!ONE_WORD.test(to)) return { ok: false, reason: 'a property name is one word: letters, digits and underscores' };
  const map = mapOf(block, graph, t);
  if (!map.ok) return map;
  if (map.entries.some((x) => x.key === to)) return { ok: false, reason: `it already has a property called ${to}` };
  const e = map.entries.find((x) => x.key === from);
  if (!e) return { ok: false, reason: notHere(from) };
  const k = e.from + block.slice(e.from, e.colon).indexOf(from);
  return { ok: true, text: block.slice(0, k) + to + block.slice(k + from.length) };
}
