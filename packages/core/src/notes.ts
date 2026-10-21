// Notes on things and links (editor spec §24). Each data block's notes are read by the graph library's own reader
// (`notes`, which the Python reader is held to by one table). They are put on the box or link drawn directly below them
// (note_comment, note_text). A note above a line holding more than one thing is said, with its fix (note_one_owner).
// The layout source never reads a note, so it stays byte-identical with the Python library's (note_standard).
import gs from '@thoughtknot/graph-spec';
import { dataKind } from './blocks.ts';
import { NOTE, TAG } from './note-lines.ts';
import type { GraphDrawing, Link, Problem, ThingNote } from './note-reading.ts';
import type { ReadText } from './partial-read.ts';
import { trimEnd, trimStart } from './whitespace.ts';
import { writtenIn } from './written-things.ts';
import { word } from './words.ts';

// what is said of a note that is shown on nothing, each made when said so it is in the language of the moment
const shared = () => word('reading.note.shared'),
  sharedFix = () => word('reading.note.shared.fix'),
  lost = () => word('reading.note.lost'),
  lostFix = () => word('reading.note.lost.fix');
const duplicate = (key: string) => word('reading.note.duplicate', { key }),
  duplicateFix = (key: string) => word('reading.note.duplicate.fix', { key });

/** The id each name in a block stands for. A thing written there, or found by MATCH, with an id of its own has that id.
 * Any other name is its own id (§3: a thing's name is its id). */
function idsIn(text: string): (name: string) => string {
  const ids = new Map<string, string>();
  for (const w of writtenIn(text)) {
    const id = w.props.get('id');
    if (w.variable && typeof id === 'string' && !ids.has(w.variable.name)) ids.set(w.variable.name, id);
  }
  return (name) => ids.get(name) ?? name;
}

/** The link drawn for one written: the first with its ends and no note yet, of its type as written. For a type written
 * without its colon, it is of the type the reader read it as, which differs only by case. */
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

/** The first /// line (1-based) of each run of note and //@ lines that sits directly above one of the `dropped` lines.
 * These are the notes on what the reader left out, found without reading the block, which could not be read whole. */
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
 * Puts each note written in the blocks on the box or link drawn directly below it, in the graphs drawn. It says what
 * cannot be shown. A warning goes on each note above a line holding more than one thing, and on a note on what the
 * reader left out. A hint goes on a note on a thing that already has one where it is first written. Notes are read from
 * each block as the reader read it (`read`, from partial-read.ts). So a thing drawn under a suggested name keeps its
 * note. Only a data block holding `///` is read again for its notes.
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
    for (const s of applied?.shared ?? []) say(s.lines[0] ?? s.line, 'warning', shared(), sharedFix());
    if (d && r?.applied && applied) attach(d, applied.notes, idsIn(r.applied), block);
    const shown = new Set(applied?.notes.map((n) => n.line));
    if (r && meant) {
      // each note meant that the reading left out: on a thing already noted, a hint; on what was left out, a warning
      const id = idsIn(r.named);
      for (const n of meant.notes.filter((x) => !shown.has(x.line))) {
        const key = 'thing' in n.element ? id(n.element.thing) : null;
        if (key !== null && d?.boxes.find((b) => b.key === key)?.note)
          say(n.lines[0] ?? n.line, 'hint', duplicate(key), duplicateFix(key));
        else say(n.lines[0] ?? n.line, 'warning', lost(), lostFix());
      }
    } else if (r) {
      // what was meant cannot be read whole: each note directly above an item the reader left out
      for (const line of notesAbove(text, r.dropped)) say(line, 'warning', lost(), lostFix());
    }
  });
  return problems;
}
