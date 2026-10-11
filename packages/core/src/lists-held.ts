// The lists a thing holds, read from a drawing (spec §14, list_as_linked_things): which lists a thing has, and the things
// each holds. Reading only: making, adding to and removing from a list are `linked-list.ts`, which re-exports these.
import type { ListShape, ListValue } from './linked-list.ts';
import type { NoteReading } from './note-reading.ts';

/** The things a thing is linked to by a list's relationship, of its kind, in the order they were written. */
export function linkedValues(reading: NoteReading, graph: string, thing: string, shape: ListShape): ListValue[] {
  const drawing = reading.graphs.get(graph);
  const out: ListValue[] = [];
  for (const l of drawing?.links ?? []) {
    const box = drawing?.boxes.find((b) => b.key === l.to);
    if (
      l.from === thing &&
      l.type === shape.rel &&
      box?.kind.split(' · ').includes(shape.kind) &&
      !out.some((o) => o.thing === l.to)
    )
      out.push({ thing: l.to, text: box.text });
  }
  return out;
}

/**
 * The lists a thing holds, found in the graph: a relationship out of the thing to bare things of one kind — things with
 * no links out and no properties but a name, as `linked-list.ts` writes them — at least two of them, or one by a
 * relationship named HAS_ and the kind. A thing with a life of its own is no list item.
 */
export function listsOf(reading: NoteReading, graph: string, thing: string): ListShape[] {
  const drawing = reading.graphs.get(graph),
    g = reading.world[graph];
  const found = new Map<string, { shape: ListShape; targets: Set<string> }>();
  for (const l of drawing?.links ?? []) {
    const box = drawing?.boxes.find((b) => b.key === l.to);
    if (l.from !== thing || !box || !g) continue;
    const bare =
      !drawing?.links.some((x) => x.from === l.to) && Object.keys(g.p(l.to)).every((p) => p === 'id' || p === 'name');
    if (!bare) continue;
    for (const kind of box.kind.split(' · ').filter(Boolean)) {
      const at = found.get(`${l.type}\u0000${kind}`) ?? { shape: { rel: l.type, kind }, targets: new Set<string>() };
      at.targets.add(l.to);
      found.set(`${l.type}\u0000${kind}`, at);
    }
  }
  // one bare target is a link, not a list, unless its relationship is named as a list's is: HAS_ and the kind
  return [...found.values()]
    .filter((f) => f.targets.size >= 2 || f.shape.rel === `HAS_${f.shape.kind.toUpperCase()}`)
    .map((f) => f.shape);
}
