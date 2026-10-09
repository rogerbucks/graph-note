// A property held as a list of linked things (spec §14, list_as_linked_things): the document profile holds no lists, so
// choosing List for a property makes each of its values a thing — of a kind, linked from this thing by a relationship,
// both named by the user — reusing a thing that already has that name. Every edit is a change to the block's text
// (spec §2), checked against the block as it now stands, so edits made before the note is read again never write a thing twice.
import type { Item } from './block-items.ts';
import { blankText, blockItems, items } from './block-items.ts';
import { hops } from './estimates.ts';
import { parseValue, propertiesOf, setProperty, spanOf } from './inspector.ts';
import type { NoteReading } from './note-reading.ts';

/** The relationship and the kind a list's things are linked by and of. */
export interface ListShape {
  rel: string;
  kind: string;
}

/** One thing in a list: its id, and its text as drawn. */
export interface ListValue {
  thing: string;
  text: string;
}

/**
 * A list edit: the block's new text, what was done in words, and the things the edit made or reused (the values added);
 * or why it cannot be made here.
 */
export type ListEdit = { ok: true; text: string; said: string; things: ListValue[] } | { ok: false; reason: string };

const WORD = /^[A-Za-z_]\w*$/;
const norm = (s: string) => s.trim().toLowerCase();
const triple = (from: string, type: string, to: string) => `${from}\u0000${type}\u0000${to}`;

/** The values a property's words hold: split at commas, semicolons and new lines, trimmed, none empty and none twice. */
export function listValues(words: string): string[] {
  const seen = new Set<string>();
  return words
    .split(/[,;\n]/)
    .map((v) => v.trim())
    .filter((v) => v !== '' && !seen.has(norm(v)) && !!seen.add(norm(v)));
}

/** A thing's id made from its value: words joined by underscores, as one word of letters, digits and underscores. */
function slug(value: string): string {
  const s = value.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return s === '' ? 'item' : /^[A-Za-z_]/.test(s) ? s : `_${s}`;
}

/** What is known of the graph's things and links: from the reading, and from the block as it now stands. */
interface Known {
  /** Each thing's kinds and text. */
  things: Map<string, { kinds: string[]; text: string }>;
  /** Every id in use, written or only mentioned. */
  taken: Set<string>;
  /** Every link, as a triple. */
  links: Set<string>;
}

const PATTERN = /\(\s*([A-Za-z_]\w*)\s*((?::\s*\w+\s*)*)(\{[^{}]*\})?\s*\)/g;
const textKeys = ['name', 'title', 'text', 'label'];

function known(reading: NoteReading, graph: string, block: string): Known {
  const things = new Map<string, { kinds: string[]; text: string }>();
  const drawing = reading.graphs.get(graph);
  for (const b of drawing?.boxes ?? []) things.set(b.key, { kinds: b.kind.split(' · ').filter(Boolean), text: b.text });
  const taken = new Set([...(reading.world[graph]?.nodes.keys() ?? []), ...things.keys()]);
  const links = new Set((drawing?.links ?? []).map((l) => triple(l.from, l.type, l.to)));
  // the block may be newer than the reading: what it writes is added to what was read
  const blank = blankText(block);
  for (const m of blank.matchAll(PATTERN)) {
    const id = m[1] ?? '';
    taken.add(id);
    if ((!m[2] && !m[3]) || things.has(id)) continue;
    const mapAt = (m.index ?? 0) + (m[3] ? m[0].indexOf(m[3]) : 0);
    const map = block.slice(mapAt, mapAt + (m[3]?.length ?? 0));
    const text = textKeys
      .map((k) => new RegExp(`\\b${k}\\s*:\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(map)?.[1])
      .find((t) => t)
      ?.replace(/\\(.)/g, '$1');
    things.set(id, {
      kinds: (m[2] ?? '')
        .split(':')
        .map((k) => k.trim())
        .filter(Boolean),
      text: text ?? id,
    });
  }
  for (const it of blockItems(block)) for (const [s, t, e] of hops(it.text)) links.add(triple(s, t, e));
  return { things, taken, links };
}

/** The thing of the kind that already has this name — by its id, or its text whatever the case — else null. */
function existing(k: Known, kind: string, value: string): string | null {
  for (const [id, t] of k.things)
    if (t.kinds.includes(kind) && (id === value || id === slug(value) || norm(t.text) === norm(value))) return id;
  return null;
}

/** The items to write for one value: the thing, when it is new, and its link from `thing`. */
function itemsFor(
  k: Known,
  thing: string,
  shape: ListShape,
  value: string,
): { id: string; lines: string[]; isNew: boolean } {
  let id = existing(k, shape.kind, value);
  const lines: string[] = [];
  const isNew = id === null;
  if (id === null) {
    let n = 1;
    const base = slug(value);
    id = base;
    while (k.taken.has(id)) id = `${base}_${++n}`;
    k.taken.add(id);
    k.things.set(id, { kinds: [shape.kind], text: value });
    const name = id === value ? '' : ` {name: ${(parseValue('text', value) as { gql: string }).gql}}`;
    lines.push(`(${id}:${shape.kind}${name})`);
  }
  lines.push(`(${thing})-[:${shape.rel}]->(${id})`);
  k.links.add(triple(thing, shape.rel, id));
  return { id, lines, isNew };
}

/** The shape's words, checked: the relationship and the kind are each one word. */
function shapeFault(shape: ListShape): string | null {
  if (!WORD.test(shape.rel)) return 'the relationship must be one word: letters, digits and underscores';
  if (!WORD.test(shape.kind)) return 'the kind must be one word: letters, digits and underscores';
  return null;
}

/** The reason a thing cannot be edited in this block, or null. */
function notHere(block: string, reading: NoteReading, graph: string, thing: string): string | null {
  return spanOf(block, { thing }) || reading.world[graph]?.nodes.has(thing)
    ? null
    : `${thing} is not written in this block: edit it where it is written, in graph ${graph}`;
}

/** The block with new items added after its last path (before any SET), comma-separated, as the block writes its own. */
function appended(block: string, lines: string[]): string {
  if (!lines.length) return block;
  const paths = items(block).filter((it) => !/^(SET|MATCH|INSERT)\b/i.test(block.slice(it.from, it.to)));
  const last = paths.at(-1);
  if (!last) return `${block}${block === '' || block.endsWith('\n') ? '' : '\n'}${lines.join(',\n')}`;
  const lineStart = block.lastIndexOf('\n', last.from - 1) + 1;
  const indent = /^[ \t]*/.exec(block.slice(lineStart, last.from))?.[0] ?? '';
  const at = block.indexOf('\n', last.to);
  const eol = at === -1 ? block.length : at;
  const tail = blankText(block.slice(last.to, eol)).trim();
  const body = lines.map((l) => indent + l);
  if (last.comma !== -1 && tail === ',')
    return `${block.slice(0, eol)}\n${body.map((l) => `${l},`).join('\n')}${block.slice(eol)}`;
  if (tail === '')
    return `${block.slice(0, last.to)},${block.slice(last.to, eol)}\n${body.join(',\n')}${block.slice(eol)}`;
  return `${block.slice(0, last.to)},\n${body.join(',\n')}${block.slice(last.to)}`;
}

function describe(made: { isNew: boolean }[]): string {
  const fresh = made.filter((m) => m.isNew).length;
  return `${made.length} linked: ${fresh} new, ${made.length - fresh} reused`;
}

/**
 * Turns a property into linked things: the property is removed from the thing, and each of its values becomes a thing of
 * `shape.kind`, linked from the thing by `shape.rel`. A thing of that kind that already has the name — by id or text — is
 * reused, not written again. With no key, nothing is removed or written (a list with no values yet).
 */
export function makeList(
  block: string,
  reading: NoteReading,
  graph: string,
  thing: string,
  key: string | null,
  shape: ListShape,
): ListEdit {
  const fault = shapeFault(shape) ?? notHere(block, reading, graph, thing);
  if (fault) return { ok: false, reason: fault };
  if (key === null) return { ok: true, text: block, said: 'a list with no values yet', things: [] };
  const words = propertiesOf(reading, graph, { thing }).find((p) => p.key === key)?.value ?? '';
  const removed = setProperty(block, graph, { thing }, key, null);
  if (!removed.ok) return removed;
  const k = known(reading, graph, removed.text);
  const lines: string[] = [];
  const made: { id: string; isNew: boolean }[] = [];
  for (const v of listValues(words)) {
    const m = itemsFor(k, thing, shape, v);
    if (!made.some((x) => x.id === m.id)) {
      lines.push(...m.lines);
      made.push(m);
    }
  }
  return {
    ok: true,
    text: appended(removed.text, lines),
    said: describe(made),
    things: made.map((m) => ({ thing: m.id, text: k.things.get(m.id)?.text ?? m.id })),
  };
}

/** Adds a value to a list: a thing of the kind, new or reused, linked from the thing; refused if it is already in the list. */
export function addToList(
  block: string,
  reading: NoteReading,
  graph: string,
  thing: string,
  shape: ListShape,
  value: string,
): ListEdit {
  const fault = shapeFault(shape) ?? notHere(block, reading, graph, thing);
  if (fault) return { ok: false, reason: fault };
  const v = value.trim();
  if (v === '') return { ok: false, reason: 'a value cannot be empty' };
  const k = known(reading, graph, block);
  const was = existing(k, shape.kind, v);
  if (was !== null && k.links.has(triple(thing, shape.rel, was)))
    return { ok: false, reason: `${v} is already in the list` };
  const m = itemsFor(k, thing, shape, v);
  return {
    ok: true,
    text: appended(block, m.lines),
    said: m.isNew ? `added ${m.id}, a new ${shape.kind}` : `added ${m.id}, which was already there`,
    things: [{ thing: m.id, text: k.things.get(m.id)?.text ?? m.id }],
  };
}

/** The block without one of its items, and the comma that parted it from its neighbour. */
function withoutItem(text: string, all: Item[], it: Item): string {
  const lineStart = text.lastIndexOf('\n', it.from - 1) + 1;
  const alone = /^[ \t]*$/.test(text.slice(lineStart, it.from));
  if (it.comma !== -1) {
    const end = it.comma + 1;
    if (!alone) return text.slice(0, it.from) + text.slice(end).replace(/^[ \t]+/, '');
    return text.slice(0, lineStart) + text.slice(end + (/^[ \t]*\n/.exec(text.slice(end))?.[0].length ?? 0));
  }
  const before = all[all.indexOf(it) - 1];
  return before && before.comma !== -1
    ? text.slice(0, before.comma) + text.slice(it.to)
    : text.slice(0, it.from) + text.slice(it.to);
}

/**
 * Removes a thing from a list: the link goes; and the thing goes too, when nothing else links to it, nothing else in
 * the block names it, and it is written as an item of its own in this block — otherwise it stays, and `said` says so.
 * A link written in one path with other things is left to the text.
 */
export function removeFromList(
  block: string,
  reading: NoteReading,
  graph: string,
  thing: string,
  shape: ListShape,
  value: string,
): ListEdit {
  const fault = shapeFault(shape) ?? notHere(block, reading, graph, thing);
  if (fault) return { ok: false, reason: fault };
  const k = known(reading, graph, block);
  const link = triple(thing, shape.rel, value);
  if (!k.links.has(link)) return { ok: false, reason: `${value} is not in the list` };
  const all = items(block);
  const bare = new RegExp(
    `^\\(\\s*${thing}\\s*\\)\\s*-\\[\\s*:\\s*${shape.rel}\\s*(\\{[^{}]*\\})?\\s*\\]\\s*->\\s*\\(\\s*${value}\\s*\\)$|^\\(\\s*${value}\\s*\\)\\s*<-\\[\\s*:\\s*${shape.rel}\\s*(\\{[^{}]*\\})?\\s*\\]\\s*-\\s*\\(\\s*${thing}\\s*\\)$`,
  );
  const written = all.filter((it) => hops(block.slice(it.from, it.to)).some(([s, t, e]) => triple(s, t, e) === link));
  const item = written.find((it) => bare.test(blankText(block.slice(it.from, it.to)).trim()));
  if (!written.length)
    return { ok: false, reason: `the link to ${value} is not written in this block: remove it where it is written` };
  if (!item)
    return {
      ok: false,
      reason: `the link to ${value} is written together with other things in one path: edit it in the text`,
    };
  let text = withoutItem(block, all, item);
  const stillThere = written.length > 1;
  const linkedElsewhere = [...k.links].some(
    (l) => l !== link && l.split('\u0000').some((end, i) => i !== 1 && end === value),
  );
  const mentions = [...blankText(text).matchAll(new RegExp(`\\b${value}\\b`, 'g'))].length;
  const left = items(text);
  const own = left.find((it) =>
    new RegExp(`^\\(\\s*${value}\\s*(?::\\s*\\w+\\s*)*(\\{[^{}]*\\})?\\s*\\)$`).test(
      blankText(text.slice(it.from, it.to)).trim(),
    ),
  );
  const label = k.things.get(value)?.text ?? value;
  if (stillThere || linkedElsewhere)
    return {
      ok: true,
      text,
      said: `removed the link; ${value} stays, as something else links to it`,
      things: [{ thing: value, text: label }],
    };
  if (!own || mentions !== 1)
    return {
      ok: true,
      text,
      said: `removed the link; ${value} stays, as it is not written alone in this block`,
      things: [{ thing: value, text: label }],
    };
  text = withoutItem(text, left, own);
  return {
    ok: true,
    text,
    said: `removed the link and ${value}, which nothing else linked to`,
    things: [{ thing: value, text: label }],
  };
}

/** The things a thing is linked to by a list's relationship, of its kind, in the order they were written. */
export function linkedValues(reading: NoteReading, graph: string, thing: string, shape: ListShape): ListValue[] {
  const drawing = reading.graphs.get(graph);
  const out: ListValue[] = [];
  for (const l of drawing?.links ?? []) {
    const box = drawing?.boxes.find((b) => b.key === l.to);
    if (
      l.from === thing &&
      l.type === shape.rel &&
      box?.kind.split(' · ').includes(shape.kind) &&
      !out.some((o) => o.thing === l.to)
    )
      out.push({ thing: l.to, text: box.text });
  }
  return out;
}

/**
 * The lists a thing holds, found in the graph: a relationship out of the thing to bare things of one kind — things with
 * no links out and no properties but a name, as this module writes them. A thing with a life of its own is no list item.
 */
export function listsOf(reading: NoteReading, graph: string, thing: string): ListShape[] {
  const drawing = reading.graphs.get(graph),
    g = reading.world[graph];
  const shapes: ListShape[] = [];
  for (const l of drawing?.links ?? []) {
    const box = drawing?.boxes.find((b) => b.key === l.to);
    if (l.from !== thing || !box || !g) continue;
    const bare =
      !drawing?.links.some((x) => x.from === l.to) && Object.keys(g.p(l.to)).every((p) => p === 'id' || p === 'name');
    if (!bare) continue;
    for (const kind of box.kind.split(' · ').filter(Boolean))
      if (!shapes.some((s) => s.rel === l.type && s.kind === kind)) shapes.push({ rel: l.type, kind });
  }
  return shapes;
}
