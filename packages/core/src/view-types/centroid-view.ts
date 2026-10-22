// The cluster-centroid view (editor spec §36, view_types_offered; editor spec §31). Each cluster is one circle, its
// centroid, sized by how many members it has. Its members sit as dots on a ring round it. The links between two clusters
// are drawn as one line, thicker for more links. It shows a big graph as its parts and how they join. It is drawn as
// marks (drawing-marks.ts), so every painter draws it the same way.
//
// The clusters are found as the graph-spec library finds them (src/clusters/clusters.js). A written cluster is a thing
// of kind Cluster, and its members link to it with MEMBER_OF. Louvain finds the rest over every other thing, by every
// other link, and a group of one is not a cluster. A thing in two clusters is drawn in both, each dot of it the same
// thing (multiple_membership). A thing in no cluster is drawn alone, as a dot.
//
// A key never holds a new line, so the ids this view joins with one never meet a thing's key.
import type { DrawMark } from '../drawing-marks.ts';
import { louvain } from '../louvain.ts';
import type { DiagramGiven } from '../plugin-diagrams.ts';
import type { GraphShape } from '../types-shape.ts';

/** The kind of a written cluster. */
const CLUSTER = 'Cluster';
/** The link that joins a member to its written cluster. */
const MEMBER_OF = 'MEMBER_OF';
/** The share of the space's half kept round the edge for names. */
const NAMES_SHARE = 0.15;
/** The largest a name is drawn. */
const NAME_MOST = 12;

/** One cluster of a shape: its id, written or found, and its members in the order written. */
export interface ShapeCluster {
  id: string;
  kind: 'asserted' | 'found';
  members: string[];
}

/** The clusters of `shape`, written first, then found, as the graph-spec library finds them. */
export function shapeClusters(shape: GraphShape): ShapeCluster[] {
  const order = new Map(shape.things.map((t, i) => [t.key, i]));
  const isCluster = new Set(shape.things.filter((t) => t.kinds.includes(CLUSTER)).map((t) => t.key));
  const written: ShapeCluster[] = [...isCluster].map((id) => ({ id, kind: 'asserted', members: [] }));
  const byId = new Map(written.map((c) => [c.id, c]));
  for (const l of shape.links) {
    const c = l.type === MEMBER_OF ? byId.get(l.to) : undefined;
    if (c && order.has(l.from) && !c.members.includes(l.from)) c.members.push(l.from);
  }
  for (const c of written) c.members.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  const things = shape.things.map((t) => t.key).filter((k) => !isCluster.has(k));
  const index = new Map(things.map((k, i) => [k, i]));
  const links: [number, number][] = [];
  for (const l of shape.links) {
    const a = index.get(l.from),
      b = index.get(l.to);
    if (l.type !== MEMBER_OF && a !== undefined && b !== undefined) links.push([a, b]);
  }
  const groupOf = louvain(things.length, links);
  const groups = new Map<number, string[]>();
  things.forEach((k, i) => {
    const g = groupOf[i] ?? i;
    (groups.get(g) ?? groups.set(g, []).get(g))?.push(k);
  });
  const found: ShapeCluster[] = [...groups.values()]
    .filter((m) => m.length > 1)
    .map((members) => ({ id: `found:${members[0]}`, kind: 'found', members }));
  return [...written, ...found];
}

/** The marks of `shape` drawn as a cluster-centroid view in `space`. */
export function centroidMarks({ shape, space }: DiagramGiven): DrawMark[] {
  if (!shape.things.length) return [];
  const clusters = shapeClusters(shape);
  const text = new Map(shape.things.map((t) => [t.key, t.text]));
  const isCluster = new Set(clusters.filter((c) => c.kind === 'asserted').map((c) => c.id));
  const placed = new Set(clusters.flatMap((c) => c.members));
  // each thing in no cluster, and not itself a written cluster, stands alone
  const alone = shape.things.map((t) => t.key).filter((k) => !placed.has(k) && !isCluster.has(k));
  const spots = [
    // a found cluster is named by its first member
    ...clusters.map((c) => ({
      id: c.id,
      members: c.members,
      label: text.get(c.id) ?? text.get(c.members[0] ?? '') ?? c.id,
    })),
    ...alone.map((k) => ({ id: k, members: [] as string[], label: text.get(k) ?? k })),
  ];
  // the spots on a grid near square, each in a cell of its own
  const across = Math.ceil(Math.sqrt((spots.length * space.width) / space.height));
  const down = Math.ceil(spots.length / across);
  const cw = space.width / across,
    ch = space.height / down;
  const most = Math.max(1, ...spots.map((s) => s.members.length));
  const room = (Math.min(cw, ch) / 2) * (1 - NAMES_SHARE);
  const centre = new Map<string, [number, number]>();
  const marks: DrawMark[] = [];
  spots.forEach((s, i) => {
    const x = (i % across) * cw + cw / 2,
      y = Math.floor(i / across) * ch + ch / 2;
    centre.set(s.id, [x, y]);
    // the centroid's area grows with its members, and the ring of members sits just outside it
    const r = Math.max(1, room * 0.6 * Math.sqrt(Math.max(1, s.members.length) / most));
    const isSpot = s.members.length > 0;
    const id = isSpot ? `centroid\n${s.id}` : s.id;
    const region = `cluster\n${s.id}`;
    const ring = Math.min(room, r + Math.max(2, room * 0.15));
    const dot = Math.max(1, Math.min(room * 0.08, (Math.PI * ring) / Math.max(1, s.members.length)));
    // a cluster's region holds its centroid and its members, so a thing in two clusters shows in both regions
    if (isSpot) {
      const half = ring + dot;
      marks.push({
        kind: 'group',
        id: region,
        style: 'cluster',
        x: x - half,
        y: y - half,
        width: 2 * half,
        height: 2 * half,
        role: 'group',
        name: s.label,
      });
    }
    marks.push({
      kind: 'box',
      id,
      ...(isSpot ? { group: region } : {}),
      ...(isCluster.has(s.id) || !isSpot ? { of: s.id } : {}),
      style: isSpot ? 'centroid' : 'thing',
      x: x - r,
      y: y - r,
      width: 2 * r,
      height: 2 * r,
      shape: 'ellipse',
      role: isSpot ? 'group' : 'thing',
      name: s.label,
    });
    s.members.forEach((m, j) => {
      const th = -Math.PI / 2 + (2 * Math.PI * j) / s.members.length;
      marks.push({
        kind: 'box',
        id: `${m}\nin\n${s.id}`,
        of: m,
        group: region,
        style: 'member',
        x: x + ring * Math.cos(th) - dot / 2,
        y: y + ring * Math.sin(th) - dot / 2,
        width: dot,
        height: dot,
        shape: 'ellipse',
        role: 'thing',
        name: text.get(m) ?? m,
      });
    });
    const size = Math.min(NAME_MOST, Math.max(ch * NAMES_SHARE * 0.5, 1));
    if (size >= 4)
      marks.push({
        kind: 'label',
        id: `${id}\nlabel`,
        style: 'text',
        x,
        y: Math.min(y + ring + dot + size, space.height),
        text: s.label,
        size,
        anchor: 'middle',
        maxWidth: Math.max(cw - 4, 1),
      });
  });
  const label = new Map(spots.map((s) => [s.id, s.label]));
  // one line for each pair of spots with links between them, thicker for more
  const spotsOf = new Map<string, string[]>();
  for (const s of spots)
    for (const m of s.members.length ? s.members : [s.id]) (spotsOf.get(m) ?? spotsOf.set(m, []).get(m))?.push(s.id);
  const between = new Map<string, { a: string; b: string; n: number }>();
  for (const l of shape.links) {
    if (l.type === MEMBER_OF) continue;
    for (const a of spotsOf.get(l.from) ?? [])
      for (const b of spotsOf.get(l.to) ?? []) {
        if (a === b) continue;
        const [p, q] = a < b ? [a, b] : [b, a];
        const key = `${p}\n${q}`;
        const e = between.get(key) ?? { a: p, b: q, n: 0 };
        e.n++;
        between.set(key, e);
      }
  }
  for (const [key, { a, b, n }] of between) {
    const p = centre.get(a),
      q = centre.get(b);
    if (!p || !q) continue;
    marks.push({
      kind: 'link',
      id: `between\n${key}`,
      style: 'link.between',
      points: [p, q],
      role: 'link',
      name: `${label.get(a)} ${label.get(b)} ${n}`,
      lineWidth: 1 + Math.log2(n),
      z: -1,
    });
  }
  return marks;
}
