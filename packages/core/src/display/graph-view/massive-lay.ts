// Laying one group of an overview out on its own and putting it in the group's box (editor spec §53, massive-view.ts).
import type { Drawn, GraphDrawing, Refusal } from '@thoughtknot/core';
import type { DrawMark } from '../../drawing-marks.ts';
import type { LaidMarks } from '../../graphviz-marks.ts';
import { sha256 } from '../../ai-digest.ts';
import { openGroup } from '../../search-fly.ts';
import type { Rect } from '../../search-fly.ts';
import { parsedSvg } from './drawing-svg';
import type { Paint } from './mark-painter.ts';
import { marksOfSvg } from './svg-marks.ts';

/** What laying a group out needs from the card: how to lay out, who asks, where the SVG is read, where colours are kept. */
export interface LayInside {
  layout: (part: GraphDrawing, owner: object) => Promise<Drawn | Refusal | null>;
  owner: object;
  el: HTMLElement;
  insidePaints: Map<string, Paint>;
}

/** The layouts of groups already laid out, by a digest of what was laid out, the newest last. Never the store: only a layout. */
const laidBefore = new Map<string, Drawn>();
/** How many group layouts are kept. */
const LAID_MOST = 64;

/**
 * `part` laid out: found saved when the same part was laid out before, else by `layout`. So a group an edit did not touch
 * is not laid out again when the card is drawn again (scale_layout_static). A refusal is never kept.
 */
async function laidOut(
  layout: LayInside['layout'],
  part: GraphDrawing,
  owner: object,
): Promise<Drawn | Refusal | null> {
  const key = sha256(JSON.stringify(part));
  const saved = laidBefore.get(key);
  if (saved) {
    laidBefore.delete(key);
    laidBefore.set(key, saved);
    return saved;
  }
  const drawn = await layout(part, owner);
  if (drawn && !('reason' in drawn)) {
    laidBefore.set(key, drawn);
    for (const [old] of laidBefore) if (laidBefore.size > LAID_MOST) laidBefore.delete(old);
  }
  return drawn;
}

/**
 * `laid` with `part`, laid out on its own, in the box of group `id`, in place of any inside shown there before. With
 * `box`, that box is made over the overview, as for a picture grown from a thing. Null when it cannot be drawn.
 */
export async function laidInside(
  { layout, owner, el, insidePaints }: LayInside,
  laid: LaidMarks,
  id: string,
  part: GraphDrawing,
  box?: Rect,
): Promise<LaidMarks | null> {
  const drawn = await laidOut(layout, part, owner);
  if (!drawn || 'reason' in drawn) return null;
  // the SVG is read in the card, so each shape takes the theme's colours, then taken away
  const holder = el.createDiv({ cls: 'thoughtknot-massive-read' });
  const svg = holder.appendChild(parsedSvg(drawn));
  const read = marksOfSvg(svg);
  holder.remove();
  const marks: DrawMark[] = read.marks.map((m) => ({ ...m, style: `${id}|${m.style}` }));
  for (const m of read.marks) insidePaints.set(`${id}|${m.style}`, read.paints(m.style));
  const base = box
    ? {
        space: laid.space,
        marks: [
          ...laid.marks.filter((m) => m.id !== id),
          { id, kind: 'group', style: 'overview.grown', z: 2.9, ...box } as const,
        ],
      }
    : laid;
  return openGroup(base, id, { space: { width: drawn.width, height: drawn.height }, marks });
}
