// The graph's summary (editor spec §24, details_always_visible): what the details panel shows, when it is kept open, while
// nothing is chosen — how many things and links the graph has, of which kinds, and how many problems — in words, as text.
import type { NoteReading } from '@graph-note/core';
import { plural } from './view-bar';

/** The summary of graph `graph`, drawn into `body`. */
export function renderSummary(body: HTMLElement, reading: NoteReading, graph: string): void {
  const drawing = reading.graphs.get(graph),
    boxes = drawing?.boxes ?? [],
    problems = reading.problems.filter((p) => p.graph === graph).length;
  body.createEl('p', {
    cls: 'graph-note-summary-counts',
    text: `${plural(boxes.length, 'thing')}, ${plural(drawing?.links.length ?? 0, 'link')}`,
  });
  body.createEl('p', {
    cls: 'graph-note-summary-problems',
    text: problems ? plural(problems, 'problem') : 'No problems',
  });
  // the kinds, most first
  const kinds = new Map<string, number>();
  for (const b of boxes) kinds.set(b.kind, (kinds.get(b.kind) ?? 0) + 1);
  if (!kinds.size) return;
  body.createEl('h4', { text: 'Kinds' });
  const ul = body.createEl('ul', { cls: 'graph-note-summary-kinds' });
  for (const [kind, n] of [...kinds].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)))
    ul.createEl('li', { text: `${kind}: ${n}` });
}
