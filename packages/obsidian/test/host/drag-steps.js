// Moving a box in a drawing, for the tests of dragging it (editor spec §6): a note with a small graph, its card shown,
// each write to the note counted as it is asked for, and the points at and beside its boxes as the viewport's pixels.
import { load } from './load-plugin.js';
import { fence } from './notes.js';
import { show } from './view-notes.js';

export const PATH = 'Some note.md';
export const TEAM = `// graph: team
(ann:Person {name: 'Ann'}),
(bob:Person {name: 'Bob'}),
(cy:Person {name: 'Cy'}),
(ann)-[:ASKS]->(bob),
(bob)-[:ASKS]->(cy)`;
export const noteOf = (...blocks) => ['# Team', '', ...blocks.flatMap((b) => [fence(b), '']), ''].join('\n');

/** Shows the note's first block at PATH, with the drawing it was laid out as and a way to point at its boxes. */
export async function card(note, options = {}) {
  const env = await load({ files: { [PATH]: note }, ...options });
  let drawn = null;
  const layout = env.plugin.layout.bind(env.plugin);
  env.plugin.layout = async (drawing, owner) => (drawn = await layout(drawing, owner));
  // each write to a note, counted as it is asked for, so a test can say none was asked for without waiting
  const writes = [],
    process = env.plugin.app.vault.process.bind(env.plugin.app.vault);
  env.plugin.app.vault.process = (file, f) => (writes.push(file.path), process(file, f));
  const { el } = await show(env, note);
  const { hitAreas } = await import('../../../core/src/hits.ts');
  const areas = hitAreas(drawn.svg);
  const vp = el.querySelector('.graph-note-viewport'),
    svg = el.querySelector('svg.graph-note-svg');
  /** A point in the drawing's own units, as the viewport's pixels. */
  const at = (x, y) => {
    const vb = areas.viewBox,
      w = Number(svg.getAttribute('width')),
      h = Number(svg.getAttribute('height'));
    return {
      clientX: parseFloat(vp.cssProps['--graph-note-x']) + ((x - vb.x) * w) / vb.width,
      clientY: parseFloat(vp.cssProps['--graph-note-y']) + ((y - vb.y) * h) / vb.height,
    };
  };
  const boxOf = (key) => el.querySelectorAll('g.node').find((g) => g.getAttribute('data-key') === key);
  /** A box's middle and size, in the drawing's own units. */
  const placeOf = (key) => {
    const s = areas.shapes.find((x) => x.id === boxOf(key).getAttribute('id'));
    const xs = s.polygons.flat().map(([x]) => x),
      ys = s.polygons.flat().map(([, y]) => y);
    const [l, t, r, b] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    return { x: (l + r) / 2, y: (t + b) / 2, w: r - l, h: b - t };
  };
  /** The point just across the ranks from a box: beside it, for the direction the drawing was laid out in. */
  const besideOf = (key) => {
    const p = placeOf(key);
    return drawn.rankdir === 'TB' ? at(p.x + p.w * 0.8, p.y) : at(p.x, p.y + p.h * 0.8);
  };
  return { env, el, vp, at, boxOf, placeOf, besideOf, writes };
}

export const mouse = (id, target, p) => ({ pointerId: id, pointerType: 'mouse', button: 0, target, ...p });

/** The same pointer as `mouse`, a finger. */
export const touch = (id, target, p) => ({ ...mouse(id, target, p), pointerType: 'touch' });
