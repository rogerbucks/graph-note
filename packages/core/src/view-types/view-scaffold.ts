// Views as scaffolds (editor spec §36, views_as_scaffolds; provisional). A view can say what a complete version of it
// needs: the fields each thing should carry. The view is drawn from what is there. Each field a thing lacks is drawn
// as a prompt beside it. Filling a prompt writes that field into the graph, so filling the gaps is capture.
//
// It is a part of its own, so it can be replaced. A role's lens, such as finance or a work-back schedule, is one more
// list of needs.
//
// A key never holds a new line, so the ids this joins with one never meet a thing's key.
import type { DrawMark } from '../drawing-marks.ts';
import { setProperty, type Edit } from '../inspector.ts';
import type { DiagramGiven } from '../plugin-diagrams.ts';
import type { ShapeThing } from '../types-shape.ts';
import { word } from '../words.ts';
import type { ViewType } from './view-types.ts';

/** A field a complete view needs on each thing. `or` names fields that stand in for it, such as `due` for `end`. */
export interface ViewNeed {
  field: string;
  or?: string[];
  /** Only things of one of these kinds need it. Every thing does when it is left out. */
  kinds?: string[];
}

/** A field a thing lacks. */
export interface ViewGap {
  thing: string;
  field: string;
}

/** What each view type needs to be complete. A view type not listed needs nothing more than its things and links. */
export const VIEW_NEEDS: Partial<Record<ViewType, ViewNeed[]>> = {
  plan: [{ field: 'start' }, { field: 'end', or: ['due'] }],
};

/** The size a prompt is drawn at. */
const PROMPT_SIZE = 10;

/** Whether `t` carries the field `f`, as a date or a number. */
const carries = (t: ShapeThing, f: string): boolean => !!(t.dates?.has(f) || t.numbers?.has(f));

/** The fields each thing lacks for `needs`, in the order of the things, then of the needs. */
export function gapsOf(things: ShapeThing[], needs: ViewNeed[]): ViewGap[] {
  return things.flatMap((t) =>
    needs
      .filter((n) => !n.kinds || n.kinds.some((k) => t.kinds.includes(k)))
      .filter((n) => ![n.field, ...(n.or ?? [])].some((f) => carries(t, f)))
      .map((n) => ({ thing: t.key, field: n.field })),
  );
}

/**
 * The view's marks with a prompt for each gap. A prompt is a label beside the thing's mark. It sits at the bottom when
 * the view draws no mark for the thing. Each prompt names the field and the thing, for a screen reader too.
 */
export function scaffoldMarks(given: DiagramGiven, drawn: DrawMark[], needs: ViewNeed[]): DrawMark[] {
  const gaps = gapsOf(given.shape.things, needs);
  if (!gaps.length) return drawn;
  const text = new Map(given.shape.things.map((t) => [t.key, t.text]));
  // the box a view draws for a thing, else its name's label
  const shown = new Map(drawn.filter((m) => m.id === m.of || m.id === `${m.of}\nlabel`).map((m) => [m.of, m]));
  const count = new Map<string, number>();
  let under = 0;
  const prompts = gaps.map((g): DrawMark => {
    const says = word('scaffold.prompt', { field: g.field, thing: text.get(g.thing) ?? g.thing });
    const n = count.get(g.thing) ?? 0;
    count.set(g.thing, n + 1);
    const m = shown.get(g.thing);
    // beside the thing, kept inside the space; else stacked up from the bottom
    const { width, height } = given.space;
    const at =
      m && 'x' in m && 'y' in m
        ? {
            x: Math.min(m.x + ('width' in m ? m.width : 0) + 4, width),
            // a box's y is its top, a label's its line
            y: Math.min(m.y + ('width' in m ? PROMPT_SIZE : 0) + n * PROMPT_SIZE, height),
          }
        : { x: 0, y: Math.max(height - under++ * PROMPT_SIZE, 0) };
    return {
      id: `prompt\n${g.thing}\n${g.field}`,
      kind: 'label',
      style: 'prompt',
      of: g.thing,
      ...at,
      text: says,
      size: PROMPT_SIZE,
      anchor: 'start',
      name: says,
      z: 1,
    };
  });
  return [...drawn, ...prompts];
}

/** The block with a gap filled: `gql` written as the thing's field. It is an edit like any other, undone as one. */
export function fillGap(block: string, graph: string, gap: ViewGap, gql: string): Edit {
  return setProperty(block, graph, { thing: gap.thing }, gap.field, gql);
}
