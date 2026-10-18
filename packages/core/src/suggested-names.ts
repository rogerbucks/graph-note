// Things drawn under a suggested name (editor spec §4, unnamed_drawn_suggested). A thing written without a name is
// drawn under the name suggested for it, and "nothing is written until its fix is accepted". Any edit that would write
// that name into the text would write it without its fix. Such edits are a path through the thing, a link to it, a
// Deferred for it, and a nudge or a look naming it. So each asks here first, and is refused with the same words:
// accept its name first.
import type { Box, NoteReading, Problem } from './note-reading.ts';
import { prepare } from './partial-read.ts';
import { textKeyOf, writtenIn } from './written-things.ts';

/** What these checks read of a note: the graphs as drawn, whose boxes say which are drawn under a suggested name. */
export type SuggestedReading = Pick<NoteReading, 'graphs'>;

/** Where a thing written without a name is: its block, and the place after its ( where the name would go. */
type Place = NonNullable<Box['suggested']>;

/**
 * Each thing of `graph` written without a name, by the name suggested for it, and where it is. It comes from the
 * problems the reader found, each a warning whose fix inserts the name. The reader's own rule, by which it marks a box
 * suggested (drawing.ts), so this and the drawing never differ.
 */
export function suggestedPlaces(problems: readonly Problem[], graph: string): Map<string, Place> {
  return new Map(
    problems.flatMap((p) =>
      p.graph === graph && p.suggested && p.insert
        ? [[p.suggested, { block: p.block, line: p.insert.line, character: p.insert.character }] as const]
        : [],
    ),
  );
}

/**
 * The things of one graph that a note's blocks write without a name, as boxes drawn under their suggested names. An
 * edit written into the note is checked against them. They are read from the note as it is when written, never from
 * a drawing, which can be older (§4). Found as the reader finds them, with its own `prepare` and rule. So they are
 * the ones the reader draws under a suggested name from these blocks. Give every block of the note, since the reader
 * suggests each name against all of them, a schema block among them.
 */
export function unnamedIn(texts: readonly string[], graph: string): SuggestedReading {
  const { clean, problems } = prepare([...texts]);
  const boxes: Box[] = [];
  for (const [name, place] of suggestedPlaces(problems, graph)) {
    const text = clean[place.block] ?? '',
      lines = text.split('\n');
    const at = lines.slice(0, place.line).reduce((sum, l) => sum + l.length + 1, 0) + place.character - 1;
    const w = writtenIn(text).find((x) => x.open === at),
      key = w && textKeyOf(w);
    boxes.push({ key: name, kind: '', text: (w && key && w.props.get(key)) || name, suggested: place });
  }
  return { graphs: new Map([[graph, { graph, boxes, links: [], estimates: [] }]]) };
}

/** The keys, of those given, that are drawn under a name only suggested, in the order given and each once. */
export function suggestedAmong(reading: SuggestedReading, graph: string, keys: readonly string[]): string[] {
  const boxes = reading.graphs.get(graph)?.boxes ?? [];
  return [...new Set(keys)].filter((k) => boxes.some((b) => b.key === k && b.suggested));
}

/**
 * Why an edit naming these keys must wait, or null when none is drawn under a suggested name: "accept its name first",
 * saying which text is only drawn under which name. The fix that writes the name is in the thing's details.
 */
export function acceptNameFirst(reading: SuggestedReading, graph: string, keys: readonly string[]): string | null {
  const unwritten = suggestedAmong(reading, graph, keys);
  const boxes = reading.graphs.get(graph)?.boxes ?? [];
  const textOf = (k: string) => boxes.find((b) => b.key === k)?.text ?? k;
  if (!unwritten.length) return null;
  if (unwritten.length === 1) {
    const [key] = unwritten as [string];
    return `accept its name first: ${textOf(key)} is only drawn under the suggested name ${key}, which is not written yet`;
  }
  const each = unwritten.map((k) => `${textOf(k)} (${k})`);
  return `accept their names first: ${each.slice(0, -1).join(', ')} and ${each.at(-1)} are only drawn under suggested names, which are not written yet`;
}
