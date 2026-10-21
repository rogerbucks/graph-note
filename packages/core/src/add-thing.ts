// Adding a thing (editor spec §5, add_thing; §4, name_from_text, suggested_name_unique). The thing's text is asked for
// first. Its name is suggested from it, in the style of the graph's names and never one of them. The thing is written
// as text after the block's last item, with its text under the key its kind's other things use. A name the user gives
// instead is held to the same rules. Nothing is written until the host is handed the new text and writes it.
import gs from '@thoughtknot/graph-spec';
import { items } from './block-items.ts';
import { graphOfBlock } from './blocks.ts';
import { appended } from './linked-list.ts';
import { quoted } from './lock.ts';
import { NameBook } from './name-book.ts';
import { keptWord } from './name-suggestions.ts';
import type { NoteReading } from './note-reading.ts';
import { S, trim } from './whitespace.ts';
import { word } from './words.ts';
import { TEXT_KEYS, writtenIn } from './written-things.ts';

/** A thing to add: its text (asked for first), the name to give it instead of the suggested one, and its kind. */
export interface NewThing {
  text: string;
  /** Left out, or blank, the name suggested from the text is used. */
  name?: string;
  /** Left out, the thing has no kind. */
  kind?: string;
}

/** What adding a thing gives: the block's new text and the name the thing was given, or the reason nothing was written. */
export type ThingAdded = { text: string; name: string } | { refused: string };

const WORD = /^[A-Za-z_]\w*$/;
const HIDDEN = new Set<string>(gs.SCHEMA_LABELS);
const oneLine = (s: string) => trim(s.replace(new RegExp(`${S}+`, 'g'), ' '));

/** Every name the graph has, with its kind, as the note was read and as the block is now typed: written or only mentioned. */
function namesOf(reading: NoteReading, graph: string, block?: string): NameBook {
  const book = new NameBook();
  for (const w of [reading.world[graph], reading.whole[graph]])
    for (const [key, [labels]] of w?.nodes ?? []) book.set(key, [...(labels ?? [])].find((l) => !HIDDEN.has(l)) ?? '');
  for (const w of block === undefined ? [] : writtenIn(block)) {
    if (w.variable) book.set(w.variable.name, w.labels.find((l) => !HIDDEN.has(l)) ?? '');
    // a thing typed with an id of its own is that id to the graph, as name-gaps takes it
    const id = w.props.get('id');
    if (id) book.set(id, '');
  }
  return book;
}

/**
 * The name suggested for a thing with this text. It is in the style the graph's names show, and unlike every name the
 * graph has (compared without regard to case). `block`, when given, is the text as typed now, whose names count too. It
 * is not a word the language keeps. A graph that is not there has no names, so its first name follows the default
 * style.
 */
export function suggestName(reading: NoteReading, graph: string, text: string, kind?: string, block?: string): string {
  return namesOf(reading, graph, block).name(oneLine(text), kind);
}

/** The key the things of a kind hold their text under: the one most of them use, else `name`. */
function keyFor(reading: NoteReading, graph: string, kind: string): string {
  const g = reading.world[graph];
  const count = new Map<string, number>();
  for (const id of kind ? (g?.labelled(kind) ?? []) : (g?.nodes.keys() ?? []))
    for (const k of Object.keys(g?.p(id) ?? {})) if (TEXT_KEYS.includes(k)) count.set(k, (count.get(k) ?? 0) + 1);
  return TEXT_KEYS.reduce(
    (best, k) => ((count.get(k) ?? 0) > (count.get(best) ?? 0) ? k : best),
    TEXT_KEYS[0] ?? 'name',
  );
}

/** Why the kind cannot be used: a locked graph's schema does not declare it. Null when it can. */
function undeclared(reading: NoteReading, graph: string, kind: string): string | null {
  const g = reading.whole[graph] ?? reading.world[graph];
  const schema = g?.labelled('ElementType').length ? g : gs.schemaFor(reading.whole, graph)[1];
  const types = schema ? schema.labelled('ElementType').map((i) => schema.p(i)) : [];
  if (!kind || !types.length || types.some((t) => t.kind === 'node' && t.name === kind)) return null;
  return word('editing.add.undeclared', { graph, kind });
}

/**
 * The block with a thing written after its last item: `(name:Kind {name: 'text'})`, comma-joined as the block writes its
 * own, nothing else changed, before any SET. The text comes first and is required; the name is the one given, else the one
 * suggested from the text. Refused, with the reason and nothing written, when:
 * - the text is empty;
 * - the name is not one word, is a word the language keeps or is taken;
 * - the kind is not one word, is a schema label or is Path. (A path is recorded with its steps, and a thing of it with
 *   none reads as broken.)
 * - the block is not of the graph;
 * - a locked graph's schema does not declare the kind;
 * - or the block holds nothing but a SET or MATCH.
 */
export function addThing(reading: NoteReading, graph: string, block: string, thing: NewThing): ThingAdded {
  const text = oneLine(thing.text),
    kind = trim(thing.kind ?? ''),
    given = trim(thing.name ?? '');
  if (!text) return { refused: word('editing.add.text-first') };
  if (graphOfBlock(block) !== graph) return { refused: word('editing.add.other-graph', { graph }) };
  if (kind && !WORD.test(kind)) return { refused: word('editing.kind-word') };
  // a schema label makes a thing the graph keeps out of its drawing, so it would be "added" and never seen
  if (HIDDEN.has(kind)) return { refused: word('editing.add.schema-label', { kind }) };
  // a Path is read as a recorded path, and one with no steps reads back as broken
  if (kind === 'Path') return { refused: word('editing.add.path-kind') };
  const why = undeclared(reading, graph, kind);
  if (why) return { refused: why };
  const book = namesOf(reading, graph, block);
  if (given && !WORD.test(given)) return { refused: word('editing.add.name-word') };
  if (given && keptWord(given)) return { refused: word('editing.add.kept-word', { name: given }) };
  if (given && [...book.names().keys()].some((n) => n.toLowerCase() === given.toLowerCase()))
    return { refused: word('editing.name-taken', { name: given, graph }) };
  const all = items(block);
  if (all.length && all.every((it) => /^(SET|MATCH)\b/i.test(block.slice(it.from, it.to))))
    return { refused: word('editing.add.only-set') };
  const name = given || book.name(text, kind || undefined);
  const key = keyFor(reading, graph, kind);
  return { text: appended(block, [`(${name}${kind ? `:${kind}` : ''} {${key}: ${quoted(text)}})`]), name };
}
