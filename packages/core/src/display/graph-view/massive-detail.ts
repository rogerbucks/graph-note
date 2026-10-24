// The detail an overview fills in as the reader looks (editor spec §53, scale_progressive, scale_level_of_detail). The
// overview is drawn first. The view then stays still for a moment. After that, the groups worth showing are laid out
// and opened one at a time (core detail-steps.ts). Each is added to the picture and clears nothing, so the screen is
// never blank. Moving the view again starts the order afresh. What is already open stays open.
import { detailOrder } from '../../detail-steps.ts';
import type { LaidMarks } from '../../graphviz-marks.ts';
import type { Grouping } from '../../scale-groups.ts';
import type { FlyView } from '../../search-fly.ts';

/** How long the view must be still, in milliseconds, before detail is filled in. */
export const DETAIL_STILL_MS = 160;

/** What the filler reads from the overview, each time it looks. */
export interface DetailState {
  open: boolean;
  /** True while the groups glide after a filter, or the view flies: nothing is opened then. */
  moving: boolean;
  overview: LaidMarks;
  camera: FlyView;
  screen: { width: number; height: number };
  opened: ReadonlySet<string>;
  grouping: Grouping;
}

/**
 * The function to call whenever the view may have changed. It opens the groups the reader most likely wants, one at a
 * time, with `openGroup`. That lays one out and shows it, and says whether it could.
 */
export function detailFiller(
  win: Window,
  state: () => DetailState,
  openGroup: (id: string) => Promise<boolean>,
): () => void {
  let timer = 0;
  let run = 0;
  /** Groups that could not be drawn, not asked for again: they would be asked for on every look. */
  const failed = new Set<string>();
  const fill = async (mine: number) => {
    for (;;) {
      const s = state();
      if (!s.open || s.moving || mine !== run) return;
      const sizes = new Map(s.grouping.groups.map((g) => [g.id, g.keys.length]));
      const next = detailOrder(s.overview, {
        view: s.camera,
        screen: s.screen,
        opened: new Set([...s.opened, ...failed]),
        sizes,
      })[0];
      if (next === undefined) return;
      if (!(await openGroup(next))) failed.add(next);
    }
  };
  return () => {
    run++;
    win.clearTimeout(timer);
    timer = win.setTimeout(() => void fill(run), DETAIL_STILL_MS);
  };
}

/** The key of the thing drawn on top at the screen point (`sx`, `sy`), found through `marksAt`; undefined when none. */
export const thingAt = (
  marksAt: (x: number, y: number) => { kind: string; of?: string }[],
  camera: FlyView,
  sx: number,
  sy: number,
) =>
  marksAt(camera.x + sx / camera.scale, camera.y + sy / camera.scale)
    .filter((m) => m.kind === 'box' && m.of)
    .pop()?.of;
