// The matrix view (editor spec §36, view_types_offered): a graph as a grid, a row and a column for each thing. A cell
// is filled where a link runs from its row's thing to its column's thing. A matrix shows a dense graph that a network
// draws as a tangle. It is drawn as marks (drawing-marks.ts), so every painter draws it the same way.
import type { DrawMark } from '../drawing-marks.ts';
import type { DiagramGiven } from '../plugin-diagrams.ts';

/** The share of the space's shorter side kept for the things' names, along the top and down the left. */
const NAMES_SHARE = 0.25;

/** The marks of `shape` drawn as a matrix in `space`: names along the top and down the left, and a cell per link. */
export function matrixMarks({ shape, space }: DiagramGiven): DrawMark[] {
  const n = shape.things.length;
  if (!n) return [];
  const names = Math.min(space.width, space.height) * NAMES_SHARE;
  const cell = Math.min((space.width - names) / n, (space.height - names) / n);
  const place = new Map(shape.things.map((t, i) => [t.key, i]));
  const text = new Map(shape.things.map((t) => [t.key, t.text]));
  const size = Math.min(cell * 0.6, names / 4);
  const marks: DrawMark[] = shape.things.flatMap((t, i): DrawMark[] => {
    const mid = names + i * cell + cell / 2;
    const common = { kind: 'label' as const, of: t.key, style: 'text', text: t.text, size, role: 'thing' as const };
    return [
      { ...common, id: `${t.key}.row`, x: names - 4, y: mid + size / 3, anchor: 'end', maxWidth: names - 8 },
      { ...common, id: `${t.key}.column`, x: mid, y: names - 4, anchor: 'middle', maxWidth: cell },
    ];
  });
  // one cell for each pair of things linked, saying every type of link between them
  const cells = new Map<string, { from: string; to: string; types: string[] }>();
  for (const l of shape.links) {
    if (!place.has(l.from) || !place.has(l.to)) continue;
    const key = `${l.from}\n${l.to}`;
    const c = cells.get(key) ?? { from: l.from, to: l.to, types: [] };
    if (!c.types.includes(l.type)) c.types.push(l.type);
    cells.set(key, c);
  }
  for (const { from, to, types } of cells.values()) {
    const row = place.get(from) ?? 0,
      column = place.get(to) ?? 0;
    marks.push({
      kind: 'box',
      // a key may hold a dot but never a new line, so the two keys are joined by one
      id: `cell.${from}\n${to}`,
      style: types.length > 1 ? 'link.many' : `link`,
      x: names + column * cell,
      y: names + row * cell,
      width: cell,
      height: cell,
      role: 'link',
      name: `${text.get(from)} ${types.join(', ')} ${text.get(to)}`,
    });
  }
  return marks;
}
