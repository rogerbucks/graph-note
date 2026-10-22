// The density view (editor spec §36, view_types_offered). The things are laid out as the force-directed view lays them
// out. Then the space is cut into squares, and each square with things in it is shaded by how many. A density view shows
// where a big graph is crowded, when its things are too many to draw one by one. It is drawn as marks
// (drawing-marks.ts), so every painter draws it the same way.
import type { DrawMark } from '../drawing-marks.ts';
import type { DiagramGiven } from '../plugin-diagrams.ts';
import { word } from '../words.ts';
import { fitted, forceLayout, type Places } from './force-view.ts';

/** How many squares across the longer side of the space. */
const SQUARES = 24;
/** How many shades there are, from fewest things to most: styles `density.0` to `density.4`. */
export const SHADES = 5;

/** The marks of `shape` drawn as a density view in `space`, starting from `previous` places where it has them. */
export function densityMarks({ shape, space }: DiagramGiven, previous?: Places): DrawMark[] {
  if (!shape.things.length) return [];
  const at = fitted(forceLayout(shape, previous), space.width, space.height);
  const side = Math.max(space.width, space.height) / SQUARES;
  const across = Math.max(1, Math.ceil(space.width / side)),
    down = Math.max(1, Math.ceil(space.height / side));
  const count = new Map<number, number>();
  for (const [x, y] of at.values()) {
    const c = Math.min(Math.floor(y / side), down - 1) * across + Math.min(Math.floor(x / side), across - 1);
    count.set(c, (count.get(c) ?? 0) + 1);
  }
  const most = Math.max(...count.values());
  return [...count.entries()]
    .sort(([a], [b]) => a - b)
    .map(([c, n]): DrawMark => {
      const col = c % across,
        row = Math.floor(c / across);
      const x = col * side,
        y = row * side;
      // shades rise with the count on a log scale, so a few crowded squares do not wash the rest out
      const shade = most === 1 ? SHADES - 1 : Math.round((Math.log(n) / Math.log(most)) * (SHADES - 1));
      return {
        kind: 'box',
        id: `square\n${col}\n${row}`,
        style: `density.${shade}`,
        x,
        y,
        width: Math.min(side, space.width - x),
        height: Math.min(side, space.height - y),
        role: 'group',
        name: word('summary.things', { count: n }),
      };
    });
}
