// Things drawn under a suggested name (editor spec §4, unnamed_drawn_suggested): a thing written without a name is drawn
// under the name suggested for it, and "nothing is written until its fix is accepted". Any edit that would write that name
// into the text — a path through the thing, a link to it, a Deferred for it, a nudge or a look naming it — would write it
// without its fix, so each asks here first, and is refused with the same words: accept its name first.
import type { NoteReading } from './note-reading.ts';

/** What these checks read of a note: the graphs as drawn, whose boxes say which are drawn under a suggested name. */
export type SuggestedReading = Pick<NoteReading, 'graphs'>;

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
