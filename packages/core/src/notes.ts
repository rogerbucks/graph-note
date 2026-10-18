// Notes on things and links (editor spec §24): each data block's notes, read by the graph library's own reader
// (`notes`, which the Python reader is held to by one table), put on the box or link drawn directly below them
// (note_comment, note_text), and a note above a line holding more than one thing said, with its fix (note_one_owner).
// The layout source never reads a note, so it stays byte-identical with the Python library's (note_standard).
import gs from '@thoughtknot/graph-spec';
import { dataKind } from './blocks.ts';
import { NOTE, TAG } from './note-lines.ts';
import type { GraphDrawing, Link, Problem, ThingNote } from './note-reading.ts';
import type { ReadText } from './partial-read.ts';
import { trimEnd, trimStart } from './whitespace.ts';
import { writtenIn } from './written-things.ts';

const SHARED = 'this note is above a line holding more than one thing, so it belongs to none of them',
  SHARED_FIX = 'put the thing the note is about on a line of its own, directly below the note',
  LOST = 'this note is not shown, as what it is on could not be read',
  LOST_FIX = 'fix the problem in this block, and the note is shown again';
const duplicate = (key: string) =>
    `this note is on ${key}, which already has a note where it is first written, so this one is not shown`,
  duplicateFix = (key: string) => `join the two notes into one, above ${key} where it is first written`;

/** The id each name in a block stands for: a thing written there, or found by MATCH, with an id of its own has that id;
 * any other name is its own id (§3: a thing's name is its id). */
function idsIn(text: string): (name: string) => string {
  const ids = new Map<string, string>();
  for (const w of writtenIn(text)) {
    const id = w.props.get('id');
    if (w.variable && typeof id === 'string' && !ids.has(w.variable.name)) ids.set(w.variable.name, id);
  }
  return (name) => ids.get(name) ?? name;
}

/** The link drawn for one written: the first with its ends and no note yet, of its type as written or, for a type
 * written without its colon, the type the reader read it as, which differs only by case. */
function linkFor(links: Link[], from: string, type: string, to: string): Link | undefined {
  const free = links.filter((l) => l.from === from && l.to === to && !l.note);
  return free.find((l) => l.type === type) ?? free.find((l) => l.type.toLowerCase() === type.toLowerCase());
}

type Read = ReturnType<typeof gs.notes>;

/** A text's notes, or null where the reader refuses it. */
function notesOf(text: string | null | undefined): Read | null {
  if (text === undefined || text === null) return null;
  try {
    return gs.notes(text);
  } catch (e) {
    if (e instanceof gs.ProfileError) return null;
    throw e;
  }
}

/** The first /// line (1-based) of each run of note and //@ lines that sits directly above one of the `dropped` lines:
 * the notes on what the reader left out, found without reading the block, which could not be read whole. */
function notesAbove(text: string, dropped: readonly number[]): number[] {
  const out: number[] = [],
    at = new Set(dropped);
  let first: number | null = null,
    inRun = false;
  text.split('\n').forEach((raw, i) => {
    const line = trimEnd(trimStart(raw));
    if (NOTE.test(line)) {
      first ??= i + 1;
      inRun = true;
    } else if (TAG.test(line)) inRun = true;
    else {
      if (inRun && first !== null && at.has(i + 1)) out.push(first);
      first = null;
      inRun = false;
    }
  });
  return out;
}

/** Puts each note the reading gives on the box or link drawn below it, the first note of a thing being its own. */
function attach(d: GraphDrawing, notes: Read['notes'], id: (name: string) => string, block: number): void {
  for (const n of notes) {
    const note: ThingNote = { text: n.text, summary: n.summary, block, lines: n.lines };
    if ('thing' in n.element) {
      const key = id(n.element.thing);
      const b = d.boxes.find((x) => x.key === key);
      if (b && !b.note) b.note = note;
    } else {
      const [from, type, to] = n.element.link;
      const l = linkFor(d.links, id(from), type, id(to));
      if (l) l.note = note;
    }
  }
}

/**
 * Puts each note written in the blocks on the box or link drawn directly below it, in the graphs drawn, and says what
 * cannot be shown: a warning for each note above a line holding more than one thing, and for a note on what the reader
 * left out; a hint for a note on a thing that already has one where it is first written. Notes are read from each block
 * as the reader read it (`read`, from partial-read.ts), so a thing drawn under a suggested name keeps its note. Only a
 * data block holding `///` is read again for its notes.
 */
export function addNotes(graphs: Map<string, GraphDrawing>, texts: string[], read: Map<number, ReadText>): Problem[] {
  const problems: Problem[] = [];
  texts.forEach((text, block) => {
    if (!text.includes('///') || dataKind(text) !== 'data') return;
    const [graph] = gs.header(text);
    const d = graph === null ? undefined : graphs.get(graph);
    const say = (line: number, severity: Problem['severity'], message: string, fix: string) =>
      problems.push({ graph, block, line, severity, message, fix });
    const r = read.get(block),
      applied = notesOf(r?.applied),
      meant = notesOf(r?.named);
    for (const s of applied?.shared ?? []) say(s.lines[0] ?? s.line, 'warning', SHARED, SHARED_FIX);
    if (d && r?.applied && applied) attach(d, applied.notes, idsIn(r.applied), block);
    const shown = new Set(applied?.notes.map((n) => n.line));
    if (r && meant) {
      // each note meant that the reading left out: on a thing already noted, a hint; on what was left out, a warning
      const id = idsIn(r.named);
      for (const n of meant.notes.filter((x) => !shown.has(x.line))) {
        const key = 'thing' in n.element ? id(n.element.thing) : null;
        if (key !== null && d?.boxes.find((b) => b.key === key)?.note)
          say(n.lines[0] ?? n.line, 'hint', duplicate(key), duplicateFix(key));
        else say(n.lines[0] ?? n.line, 'warning', LOST, LOST_FIX);
      }
    } else if (r) {
      // what was meant cannot be read whole: each note directly above an item the reader left out
      for (const line of notesAbove(text, r.dropped)) say(line, 'warning', LOST, LOST_FIX);
    }
  });
  return problems;
}
