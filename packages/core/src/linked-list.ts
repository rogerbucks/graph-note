// A property held as a list of linked things (spec §14, list_as_linked_things). The document profile holds no lists.
// So choosing List for a property makes each of its values a thing, reusing a thing that already has that name. Each
// is of a kind, linked from this thing by a relationship, both named by the user. Every edit is a change to the
// block's text (spec §2), checked against the block as it now stands. So edits made before the note is read again
// never write a thing twice.
import type { Item } from './block-items.ts';
import { blankText, blockItems, items } from './block-items.ts';
import { readNote } from './drawing.ts';
import { hops } from './estimates.ts';
import { literally, parseValue, propertiesOf, setProperty, spanOf } from './inspector.ts';
import { nameFromText, nameStyleOf } from './name-suggestions.ts';
import { runStart } from './note-lines.ts';
import type { NameStyle } from './name-suggestions.ts';
import type { NoteReading } from './note-reading.ts';
import { acceptNameFirst } from './suggested-names.ts';
import { word } from './words.ts';

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
 * A list edit: the block's new text, what was done in words, and the things the edit made or reused (the values
 * added). Or else, why it cannot be made here.
 */
export type ListEdit = { ok: true; text: string; said: string; things: ListValue[] } | { ok: false; reason: string };

const WORD = /^[A-Za-z_]\w*$/;
const norm = (s: string) => s.trim().toLowerCase();
const itself = (value: string) => word('editing.list.itself', { value });
const triple = (from: string, type: string, to: string) => `${from}\u0000${type}\u0000${to}`;

/** The values a property's words hold: split at commas, semicolons and new lines, trimmed, none empty and none twice. */
export function listValues(words: string): string[] {
  const seen = new Set<string>();
  return words
    .split(/[,;\n]/)
    .map((v) => v.trim())
    .filter((v) => v !== '' && !seen.has(norm(v)) && !!seen.add(norm(v)));
}

/** What is known of the graph's things and links: from the reading, and from the block as it now stands. */
interface Known {
  /** Each thing's kinds and text. */
  things: Map<string, { kinds: string[]; text: string }>;
  /** Every id in use, written or only mentioned. */
  taken: Set<string>;
  /** Every link, as a triple. */
  links: Set<string>;
  /** The style of the graph's names as they were when this was read: every thing a call makes is named in it. */
  style: NameStyle;
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
  const style = nameStyleOf(new Map([...taken].map((t) => [t, things.get(t)?.kinds[0] ?? ''])));
  return { things, taken, links, style };
}

/**
 * The thing of the kind that already has this name: an id equal to the value, or text equal to it whatever the case.
 * Else null.
 */
function existing(k: Known, kind: string, value: string): string | null {
  for (const [id, t] of k.things)
    if (t.kinds.includes(kind) && (id === value || norm(t.text) === norm(value))) return id;
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
    // the id follows the style of the graph's own names, and is none of them; the value keeps its words as the name.
    // The style was fixed when the graph was read, so a value is named the same whatever was named before it
    id = nameFromText(
      value,
      new Map([...k.taken].map((t) => [t, k.things.get(t)?.kinds[0] ?? ''])),
      shape.kind,
      k.style,
    );
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
  if (!WORD.test(shape.rel)) return word('editing.list.relationship-word');
  if (!WORD.test(shape.kind)) return word('editing.kind-word');
  return null;
}

/** The reason a thing cannot be edited in this block, or null. */
function notHere(block: string, reading: NoteReading, graph: string, thing: string): string | null {
  return spanOf(block, { thing }) || reading.world[graph]?.nodes.has(thing)
    ? null
    : word('editing.not-in-block', { thing, graph });
}

/**
 * Why a list cannot be written for this thing: it is drawn under a suggested name. The link would write it by name
 * without its fix (§4). The same for a value that reuses such a thing.
 */
function unwritten(reading: NoteReading, graph: string, ...keys: (string | null)[]): string | null {
  return acceptNameFirst(
    reading,
    graph,
    keys.filter((k): k is string => k !== null),
  );
}

/** The block with new items added after its last path or INSERT (before any SET), comma-separated, as the block writes its own. */
export function appended(block: string, lines: string[]): string {
  if (!lines.length) return block;
  const paths = items(block).filter((it) => !/^(SET|MATCH)\b/i.test(block.slice(it.from, it.to)));
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
  return word('editing.list.linked', {
    count: made.length,
    fresh: String(fresh),
    reused: String(made.length - fresh),
  });
}

/**
 * Turns a property into linked things. The property is removed from the thing, and each of its values becomes a thing
 * of `shape.kind`, linked from the thing by `shape.rel`. A thing of that kind that already has the name — by id or
 * text — is reused, not written again. With no key, nothing is removed or written (a list with no values yet).
 */
export function makeList(
  block: string,
  reading: NoteReading,
  graph: string,
  thing: string,
  key: string | null,
  shape: ListShape,
): ListEdit {
  const fault = shapeFault(shape) ?? unwritten(reading, graph, thing) ?? notHere(block, reading, graph, thing);
  if (fault) return { ok: false, reason: fault };
  if (key === null) return { ok: true, text: block, said: word('editing.list.empty'), things: [] };
  // the values are those the block says now: the reading may be older than the text
  const wordsIn = (r: NoteReading) => propertiesOf(r, graph, { thing }).find((p) => p.key === key)?.value;
  const words = wordsIn(readNote([block])) ?? wordsIn(reading) ?? '';
  const removed = setProperty(block, graph, { thing }, key, null);
  if (!removed.ok) return removed;
  const k = known(reading, graph, removed.text);
  const lines: string[] = [];
  const made: { id: string; isNew: boolean }[] = [];
  for (const v of listValues(words)) {
    const was = existing(k, shape.kind, v);
    if (was === thing) return { ok: false, reason: itself(v) };
    const first = unwritten(reading, graph, was);
    if (first) return { ok: false, reason: first };
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

/** Adds a value to a list: a thing of the kind, new or reused, linked from the thing. Refused if already listed. */
export function addToList(
  block: string,
  reading: NoteReading,
  graph: string,
  thing: string,
  shape: ListShape,
  value: string,
): ListEdit {
  const fault = shapeFault(shape) ?? unwritten(reading, graph, thing) ?? notHere(block, reading, graph, thing);
  if (fault) return { ok: false, reason: fault };
  const v = value.trim();
  if (v === '') return { ok: false, reason: word('editing.list.value-empty') };
  const k = known(reading, graph, block);
  const was = existing(k, shape.kind, v);
  if (was === thing) return { ok: false, reason: itself(v) };
  const first = unwritten(reading, graph, was);
  if (first) return { ok: false, reason: first };
  if (was !== null && k.links.has(triple(thing, shape.rel, was)))
    return { ok: false, reason: word('editing.list.already', { value: v }) };
  const m = itemsFor(k, thing, shape, v);
  return {
    ok: true,
    text: appended(block, m.lines),
    said: m.isNew
      ? word('editing.list.added-new', { thing: m.id, kind: shape.kind })
      : word('editing.list.added-again', { thing: m.id }),
    things: [{ thing: m.id, text: k.things.get(m.id)?.text ?? m.id }],
  };
}

/**
 * The block without one of its items, and the comma that parted it from its neighbour. Nothing else goes but the note
 * and tags directly above it (editor spec §24, note_kept_by_edits). They go with a thing or link written on a line of
 * its own, so the next item never takes them up.
 */
export function withoutItem(text: string, all: Item[], it: Item): string {
  const lineStart = text.lastIndexOf('\n', it.from - 1) + 1;
  const alone = /^[ \t]*$/.test(text.slice(lineStart, it.from));
  // the note's lines go too, when nothing else is on the item's line: the note belongs to the item alone
  const sole = alone && /^[ \t]*(?:,[ \t]*)?(?:\r?\n|$)/.test(text.slice(it.to));
  const own = sole ? runStart(text, lineStart) : lineStart;
  if (it.comma !== -1) {
    const end = it.comma + 1;
    if (!alone) return text.slice(0, it.from) + text.slice(end).replace(/^[ \t]+/, '');
    return text.slice(0, own) + text.slice(end + (/^[ \t]*\r?\n/.exec(text.slice(end))?.[0].length ?? 0));
  }
  // the last item: its own line goes, and the comma that parted it from the item before; other comments and blank lines stay
  const before = all[all.indexOf(it) - 1];
  // the line break before it goes with it, a CR with its LF
  const brk = own > 1 && text[own - 2] === '\r' ? own - 2 : own - 1;
  const cut = text.slice(0, alone && own > 0 ? brk : it.from) + text.slice(it.to);
  return before && before.comma !== -1 ? cut.slice(0, before.comma) + cut.slice(before.comma + 1) : cut;
}

/**
 * Removes a thing from a list: the link goes. The thing goes too, when all of these hold:
 * - nothing else links to it;
 * - nothing else in the block names it;
 * - it is written as an item of its own in this block.
 * Otherwise it stays, and `said` says so. A link written in one path with other things is left to the text.
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
  if (!k.links.has(link)) return { ok: false, reason: word('editing.list.not-in', { value }) };
  const all = items(block);
  // the names as written, each character as itself, so an id such as c++ is matched, never read as a pattern
  const [th, rel, va] = [thing, shape.rel, value].map(literally);
  const bare = new RegExp(
    `^\\(\\s*${th}\\s*\\)\\s*-\\[\\s*:\\s*${rel}\\s*(\\{[^{}]*\\})?\\s*\\]\\s*->\\s*\\(\\s*${va}\\s*\\)$|^\\(\\s*${va}\\s*\\)\\s*<-\\[\\s*:\\s*${rel}\\s*(\\{[^{}]*\\})?\\s*\\]\\s*-\\s*\\(\\s*${th}\\s*\\)$`,
  );
  const written = all.filter((it) => hops(block.slice(it.from, it.to)).some(([s, t, e]) => triple(s, t, e) === link));
  const item = written.find((it) => bare.test(blankText(block.slice(it.from, it.to)).trim()));
  if (!written.length) return { ok: false, reason: word('editing.list.link-elsewhere', { value }) };
  if (!item)
    return {
      ok: false,
      reason: word('editing.list.link-in-path', { value }),
    };
  let text = withoutItem(block, all, item);
  const stillThere = written.length > 1;
  const linkedElsewhere = [...k.links].some(
    (l) => l !== link && l.split('\u0000').some((end, i) => i !== 1 && end === value),
  );
  const mentions = [...blankText(text).matchAll(new RegExp(`\\b${va}\\b`, 'g'))].length;
  const left = items(text);
  const own = left.find((it) =>
    new RegExp(`^\\(\\s*${va}\\s*(?::\\s*\\w+\\s*)*(\\{[^{}]*\\})?\\s*\\)$`).test(
      blankText(text.slice(it.from, it.to)).trim(),
    ),
  );
  const label = k.things.get(value)?.text ?? value;
  // bare as listsOf means it: no property but its name, written here or set elsewhere
  const ownMap = own && /\{([^{}]*)\}/.exec(blankText(text.slice(own.from, own.to)))?.[1];
  const keys = [...(ownMap ?? '').matchAll(/(?:^|,)\s*(\w+)\s*:/g)].map((m) => m[1]);
  const rich =
    keys.some((x) => x !== 'name') ||
    Object.keys(reading.world[graph]?.p(value) ?? {}).some((x) => x !== 'id' && x !== 'name');
  if (stillThere || linkedElsewhere)
    return {
      ok: true,
      text,
      said: word('editing.list.stays-linked', { value }),
      things: [{ thing: value, text: label }],
    };
  if (rich)
    return {
      ok: true,
      text,
      said: word('editing.list.stays-properties', { value }),
      things: [{ thing: value, text: label }],
    };
  if (!own || mentions !== 1)
    return {
      ok: true,
      text,
      said: word('editing.list.stays-not-alone', { value }),
      things: [{ thing: value, text: label }],
    };
  text = withoutItem(text, left, own);
  return {
    ok: true,
    text,
    said: word('editing.list.removed-both', { value }),
    things: [{ thing: value, text: label }],
  };
}

// reading the lists a thing holds is its own module; re-exported, so what imports this one is unchanged
export { linkedValues, listsOf } from './lists-held.ts';
