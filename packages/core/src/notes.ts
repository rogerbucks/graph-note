// Notes on things and links (editor spec §24): each data block's notes, read by the graph library's own reader
// (`notes`, which the Python reader is held to by one table), put on the box or link drawn directly below them
// (note_comment, note_text), and a note above a line holding more than one thing said, with its fix (note_one_owner).
// The layout source never reads a note, so it stays byte-identical with the Python library's (note_standard).
import gs from '@graph-note/graph-spec';
import { dataKind } from './blocks.ts';
import type { GraphDrawing, Link, Problem, ThingNote } from './note-reading.ts';
import { writtenIn } from './written-things.ts';

const SHARED = 'this note is above a line holding more than one thing, so it belongs to none of them',
  SHARED_FIX = 'put the thing the note is about on a line of its own, directly below the note';

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

/**
 * Puts each note written in the blocks on the box or link drawn directly below it, in the graphs drawn, and gives a
 * warning for each note above a line holding more than one thing, on its first line. Only a data block holding `///` is
 * read again for its notes; one the reader refuses gives none, its own problem being listed already.
 */
export function addNotes(graphs: Map<string, GraphDrawing>, texts: string[]): Problem[] {
  const problems: Problem[] = [];
  texts.forEach((text, block) => {
    if (!text.includes('///') || dataKind(text) !== 'data') return;
    let read: ReturnType<typeof gs.notes>;
    try {
      read = gs.notes(text);
    } catch (e) {
      if (e instanceof gs.ProfileError) return;
      throw e;
    }
    const [graph] = gs.header(text);
    for (const s of read.shared)
      problems.push({
        graph,
        block,
        line: s.lines[0] ?? s.line,
        severity: 'warning',
        message: SHARED,
        fix: SHARED_FIX,
      });
    const d = graph === null ? undefined : graphs.get(graph);
    if (!d || !read.notes.length) return;
    const id = idsIn(text);
    for (const n of read.notes) {
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
  });
  return problems;
}
