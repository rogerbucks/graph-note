// The chord view (editor spec §36, view_types_offered). A graph's things sit around a circle, a kind's things side by
// side. Each link is a curve across the middle. A chord view shows how much the parts of a graph talk to each other, which a
// network hides in a tangle. It is drawn as marks (drawing-marks.ts), so every painter draws it the same way.
import type { DrawMark } from '../drawing-marks.ts';
import type { DiagramGiven } from '../plugin-diagrams.ts';

/** The share of the circle's radius kept outside it for names. */
const NAMES_SHARE = 0.25;
/** Past this many things, only each kind is named, not each thing. */
const NAMED_MOST = 60;
/** The share of the circle left as a gap after each kind, so the kinds stand apart. */
const GAP_SHARE = 0.02;

/** The marks of `shape` drawn as a chord view in `space`: a box for each thing on the circle, a curve for each link. */
export function chordMarks({ shape, space }: DiagramGiven): DrawMark[] {
  const n = shape.things.length;
  if (!n) return [];
  const cx = space.width / 2,
    cy = space.height / 2;
  const outer = Math.min(space.width, space.height) / 2;
  const r = outer * (1 - NAMES_SHARE);
  // the things in order of their kinds, each kind in the order it is first written
  const kinds = [...new Set(shape.things.map((t) => t.kinds.join(', ')))];
  const ordered = kinds.flatMap((k) => shape.things.filter((t) => t.kinds.join(', ') === k));
  const gap = kinds.length > 1 ? GAP_SHARE * 2 * Math.PI : 0;
  const step = (2 * Math.PI - gap * kinds.length) / n;
  const angle = new Map<string, number>();
  let a = -Math.PI / 2,
    last = '';
  for (const t of ordered) {
    const kind = t.kinds.join(', ');
    if (last && kind !== last) a += gap;
    last = kind;
    angle.set(t.key, a + step / 2);
    a += step;
  }
  const at = (t: number, radius: number): [number, number] => [cx + radius * Math.cos(t), cy + radius * Math.sin(t)];
  const size = Math.max(Math.min((step * r) / 1.5, outer * 0.05), 1);
  const nameSize = Math.min(12, Math.max(size, 6));
  const marks: DrawMark[] = [];
  for (const t of ordered) {
    const th = angle.get(t.key) ?? 0;
    const [x, y] = at(th, r);
    marks.push({
      kind: 'box',
      id: t.key,
      of: t.key,
      style: `kind.${kinds.indexOf(t.kinds.join(', '))}`,
      x: x - size / 2,
      y: y - size / 2,
      width: size,
      height: size,
      shape: 'ellipse',
      role: 'thing',
      name: t.text,
    });
    if (n <= NAMED_MOST) {
      const [lx, ly] = at(th, r + size);
      marks.push({
        kind: 'label',
        id: `${t.key}.label`,
        of: t.key,
        style: 'text',
        x: lx,
        y: ly + nameSize / 3,
        text: t.text,
        size: nameSize,
        anchor: Math.cos(th) >= 0 ? 'start' : 'end',
        maxWidth: outer - r - size,
      });
    }
  }
  if (n > NAMED_MOST)
    kinds.forEach((kind, i) => {
      const ths = ordered.filter((t) => t.kinds.join(', ') === kind).map((t) => angle.get(t.key) ?? 0);
      const th = ((ths[0] ?? 0) + (ths[ths.length - 1] ?? 0)) / 2;
      const [lx, ly] = at(th, r + size);
      marks.push({
        kind: 'label',
        id: `kind.${i}.label`,
        style: 'text',
        x: lx,
        y: ly + nameSize / 3,
        text: kind,
        size: nameSize,
        anchor: Math.cos(th) >= 0 ? 'start' : 'end',
        maxWidth: outer - r - size,
      });
    });
  shape.links.forEach((l, i) => {
    const from = angle.get(l.from),
      to = angle.get(l.to);
    if (from === undefined || to === undefined) return;
    const p = at(from, r - size / 2),
      q = at(to, r - size / 2);
    // a curve pulled towards the middle: closer ends bend less
    const pull = 0.25 + 0.5 * Math.abs(Math.sin((to - from) / 2));
    const c1 = at(from, (r - size / 2) * (1 - pull)),
      c2 = at(to, (r - size / 2) * (1 - pull));
    marks.push({
      kind: 'link',
      id: `link.${i}`,
      style: 'link',
      points: [p, c1, c2, q],
      curve: true,
      from: l.from,
      to: l.to,
      role: 'link',
      name: `${l.from} ${l.type} ${l.to}`,
      z: -1,
    });
  });
  return marks;
}
