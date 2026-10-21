// A proposal laid over the drawing (editor spec §17, proposal_shown_not_applied and proposals_read_back). It says which
// boxes and links each change adds, changes or removes, so a host can mark them — in words as well as in colour. Each
// change is read back in plain language, in the words the text pane reads a line in (`readBack`).
import { hops } from './estimates.ts';
import { readBack } from './help.ts';
import type { NoteReading } from './note-reading.ts';
import { namesOf } from './proposals-apply.ts';
import { statementOf } from './proposals-statements.ts';
import type { ProposedChange } from './proposals.ts';
import { word } from './words.ts';

/** What a change does to what it marks: adds it, changes it or removes it. */
export type MarkKind = 'add' | 'change' | 'remove';

/**
 * The mark said in a word, in the reader's language: never left to colour alone. It starts with a capital, as a line
 * starts. With `within`, it is the word as it is said within a sentence.
 */
export const markWord = (kind: MarkKind, within = false): string =>
  word(within ? `proposal.mark.${kind}-within` : `proposal.mark.${kind}`);

/** A mark on a box or a link, and the changes that put it there. */
export interface ChangeMark {
  kind: MarkKind;
  ids: string[];
}

/** The boxes (by key) and the links (by their place among the graph's drawn links) a proposal's changes mark. */
export interface Marks {
  boxes: Map<string, ChangeMark>;
  links: Map<number, ChangeMark>;
}

/** What a change does to the drawing. */
export const markOf = (c: ProposedChange): MarkKind => (c.op === 'add' ? 'add' : c.op === 'set' ? 'change' : 'remove');

/**
 * The marks of these changes on the drawing of `graph` in `reading`. The reading must be the graph with the additions
 * and changes laid over it. What is added is drawn, and a removal is still drawn, to be marked. A change that marks
 * nothing drawn — a thing the drawing does not hold — marks nothing.
 */
export function marksOf(reading: NoteReading, graph: string, changes: readonly ProposedChange[]): Marks {
  const drawn = reading.graphs.get(graph);
  const marks: Marks = { boxes: new Map(), links: new Map() };
  if (!drawn) return marks;
  const keys = new Set(drawn.boxes.map((b) => b.key));
  const mark = <K>(map: Map<K, ChangeMark>, at: K, c: ProposedChange) => {
    const have = map.get(at);
    if (have) have.ids.push(c.id);
    else map.set(at, { kind: markOf(c), ids: [c.id] });
  };
  // a link is found by its ends and its type, the latest first for an addition (written last) and the first for a removal
  const linkAt = (from: string, type: string, to: string, latest: boolean): number | undefined => {
    const at = drawn.links.flatMap((l, i) => (l.from === from && l.type === type && l.to === to ? [i] : []));
    const free = at.filter((i) => !marks.links.has(i));
    return (latest ? free.at(-1) : free[0]) ?? undefined;
  };
  for (const c of changes) {
    if (c.op === 'add') {
      for (const n of namesOf(c).writes) if (keys.has(n)) mark(marks.boxes, n, c);
      for (const [from, type, to] of hops(c.gql)) {
        const i = linkAt(from, type, to, true);
        if (i !== undefined) mark(marks.links, i, c);
      }
    } else if (c.op === 'remove-link') {
      const i = linkAt(c.from, c.type, c.to, false);
      if (i !== undefined) mark(marks.links, i, c);
    } else if (keys.has(c.thing)) mark(marks.boxes, c.thing, c);
  }
  return marks;
}

/**
 * What a change is, exactly, as it would be written, as the change set writes it. That is the GQL an addition adds, the
 * SET statement of a change of a property, or the DELETE statement of a removal. The plain language of `saidOf` can say
 * less than this; this never does.
 */
export function exactOf(c: ProposedChange): string {
  return statementOf(c);
}

/**
 * A change in plain language, as the text pane reads a line. Examples: "Added: Small reader is an Option"; "Changed:
 * Large reader: price is 4"; "Removed: Alice is a Person". Read in `reading`, the graph with the change laid over it
 * where it adds or changes. So the things it names are there to be called by their text.
 */
export function saidOf(reading: NoteReading, graph: string, c: ProposedChange): string {
  const kind = (thing: string) =>
    reading.graphs
      .get(graph)
      ?.boxes.find((b) => b.key === thing)
      ?.kind.split(' · ')[0];
  const text =
    c.op === 'add'
      ? c.gql
      : c.op === 'set'
        ? `SET ${c.thing}.${c.key} = ${c.value}`
        : c.op === 'remove-link'
          ? `(${c.from})-[:${c.type}]->(${c.to})`
          : `(${c.thing}${kind(c.thing) ? `:${kind(c.thing)}` : ''})`;
  const said = [...readBack(reading, graph, text).entries()].sort(([a], [b]) => a - b).map(([, s]) => s);
  return word(`proposal.said.${markOf(c)}`, { change: said.length ? said.join('; ') : text });
}
