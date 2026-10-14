// The data as a GQL block (editor spec §16, export_data_formats, export_lossless): the graph line, a comment saying where
// it came from, then each thing and each link on a line of its own, in the document profile, so the graph-spec reader
// reads it back into the very things and links exported. A thing is written under its id where its id is a name the
// profile reads as one; otherwise, as for an id with a space or a word the profile keeps, under a name of its own, with
// its id written in full. A view's faded context, when asked for, is marked by a `//@ faded:` line above each of its
// things and links. A note (§24, note_standard) is kept as the `///` lines directly above its thing or link.
import gs from '@graph-note/graph-spec';
import type { GTime, Value } from '@graph-note/graph-spec';
import { saidDate } from './export-frame.ts';
import { kindOf, numberText, oneLine, timeText } from './export-data-model.ts';
import type { DataInfo, ExportedData } from './export-data-model.ts';

// a name as the profile reads one, and the words it keeps, which are never a thing's name in a block written here
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const KEPT = new Set(['INSERT', 'MATCH', 'SET', 'DATE', 'DATETIME', 'TRUE', 'FALSE']);

/** A value as the profile writes it. */
function valueText(v: Value): string {
  const kind = kindOf(v);
  if (kind === 'text') return gs.quote(v as string);
  if (kind === 'number') return numberText(v as number);
  if (kind === 'boolean') return v ? 'TRUE' : 'FALSE';
  return `${kind === 'date' ? 'DATE' : 'DATETIME'} ${gs.quote(timeText(v as GTime))}`;
}

/** Properties as the profile writes them, ` {key: value, …}`, or nothing when there are none. */
function propsText(props: [string, Value][]): string {
  return props.length ? ` {${props.map(([k, v]) => `${k}: ${valueText(v)}`).join(', ')}}` : '';
}

/** The name each thing is written under in the block: its id where that can be one, else `thing_<n>`, unused by any id. */
function namesOf(ids: string[]): Map<string, string> {
  const own = (id: string) => NAME.test(id) && !KEPT.has(id.toUpperCase());
  const taken = new Set(ids.filter(own));
  const out = new Map<string, string>();
  let n = 0;
  for (const id of ids) {
    if (own(id)) out.set(id, id);
    else {
      let name = '';
      do name = `thing_${++n}`;
      while (taken.has(name));
      out.set(id, name);
    }
  }
  return out;
}

/** The data as one GQL block of the graph it came from, its lines ending at LF, ending with one. */
export function gqlBlock(data: ExportedData, info: DataInfo): string {
  const names = namesOf(data.things.map(([id]) => id));
  const things = data.things.map(([id, kinds, props]) => {
    const name = names.get(id) ?? id;
    const rest = Object.entries(props).filter(([k]) => k !== 'id');
    // the id is written unless the name says it, and always for a thing with no kind and nothing else, which the
    // profile would otherwise read as a mention of a thing written before, never as a thing
    const withId = name !== id || (!kinds.length && !rest.length) ? [['id', id] as [string, Value], ...rest] : rest;
    return `(${name}${kinds.map((k) => `:${k}`).join('')}${propsText(withId)})`;
  });
  const links = data.links.map(
    ([from, type, to, props]) =>
      `(${names.get(from) ?? from})-[:${type}${propsText(Object.entries(props))}]->(${names.get(to) ?? to})`,
  );
  const what = data.view === undefined ? `graph ${data.graph}` : `view ${data.view} of graph ${data.graph}`;
  const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const said = `// Exported from ${oneLine(info.note)}, ${oneLine(what)}, ${saidDate(info.date)}: ${count(data.things.length, 'thing')} and ${count(data.links.length, 'link')}.`;
  // a view's faded context: each thing and link outside the view owns a //@ line saying so (§27), which is a comment to
  // the reader, so the graph read back is the same, and a tag to the library's ownedComments, so it is told apart
  const fadedThings = new Set(data.faded?.things ?? []),
    fadedLinks = new Set(data.faded?.links ?? []);
  const tag = `//@ faded: outside view ${oneLine(data.view ?? '')}`;
  const outside = [...data.things.map(([id]) => fadedThings.has(id)), ...data.links.map((_, i) => fadedLinks.has(i))];
  // each note as the /// lines directly above its thing or link (§26): a line of its text after `/// `, an empty one a
  // bare `///`, so the library's notes reads back the very text
  const thingNotes = new Map(data.notes?.things ?? []),
    linkNotes = new Map(data.notes?.links ?? []);
  const notes = [...data.things.map(([id]) => thingNotes.get(id)), ...data.links.map((_, i) => linkNotes.get(i))];
  const noteLines = (text: string) => text.split('\n').map((l) => (l === '' ? '///' : `/// ${l}`));
  const code = [...things, ...links].map((line, i, all) => {
    const written = i < all.length - 1 ? `${line},` : line;
    const note = notes[i];
    return [...(note === undefined ? [] : noteLines(note)), ...(outside[i] ? [tag] : []), written].join('\n');
  });
  return [`// graph: ${data.graph}`, said, ...code, ''].join('\n');
}
