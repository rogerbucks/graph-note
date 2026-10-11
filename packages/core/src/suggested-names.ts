// Things drawn under a suggested name (editor spec §4, unnamed_drawn_suggested): a thing written without a name is drawn
// under the name suggested for it, and "nothing is written until its fix is accepted". Any edit that would write that name
// into the text — a path through the thing, a link to it, a Deferred for it, a nudge or a look naming it — would write it
// without its fix, so each asks here first, and is refused with the same words: accept its name first.
import { dataKind, graphOfBlock } from './blocks.ts';
import { nameGaps } from './name-gaps.ts';
import type { Box, NoteReading } from './note-reading.ts';
import { textKeyOf, writtenIn } from './written-things.ts';

/** What these checks read of a note: the graphs as drawn, whose boxes say which are drawn under a suggested name. */
export type SuggestedReading = Pick<NoteReading, 'graphs'>;

/**
 * The things of one graph that these blocks write without a name, as boxes drawn under their suggested names: for an edit
 * that is given no drawing to ask (`styleEdit`, which has the whole note), so that none can write a suggested name by
 * leaving the drawing out. Found as the reader finds them, from the blocks given: so only every block of the note gives
 * the reader's names, the reader suggesting each name against all of them.
 */
export function unnamedIn(texts: readonly string[], graph: string): SuggestedReading {
  const blocks = texts.map((t) => ({ text: typeof dataKind(t) === 'string' ? t : '', graph: graphOfBlock(t) }));
  const gaps = nameGaps(blocks);
  const boxes: Box[] = [];
  blocks.forEach((b, i) => {
    if (b.graph !== graph) return;
    const lines = b.text.split('\n'),
      written = writtenIn(b.text);
    for (const n of gaps[i]?.named ?? []) {
      const at = lines.slice(0, n.line).reduce((sum, l) => sum + l.length + 1, 0) + n.character - 1;
      const w = written.find((x) => x.open === at),
        key = w && textKeyOf(w);
      boxes.push({
        key: n.name,
        kind: '',
        text: (w && key && w.props.get(key)) || n.name,
        suggested: { block: i, line: n.line, character: n.character },
      });
    }
  });
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
