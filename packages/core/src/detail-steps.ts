// The detail a massive graph shows, and in what order (editor spec §53, scale_progressive, scale_level_of_detail). The
// graph opens as its overview, a box for each group. That is the first picture, and it needs no detail. More detail
// then arrives a group at a time. Each step is added to the picture. It clears nothing but the group's own name and
// count (search-fly.ts openGroup). So the screen is never blank while it waits.
//
// Which group comes next is the one the reader most likely wants:
// 1. the group they chose, if it is still closed;
// 2. then the groups on screen, the nearest to the middle of the screen first.
// A group is opened only when its box is big enough on screen to show detail worth reading. So zoomed far out, every
// group stays one box. A group is also opened only while the open groups on screen hold few enough things. So what is
// drawn never grows past what is seen.
//
// Host-free and pure: the same view gives the same order every time.
import type { LaidMarks } from './graphviz-marks.ts';
import { openGroup } from './search-fly.ts';
import type { FlyView } from './search-fly.ts';

/** How many screen pixels the shorter side of a group's box must span before its inside is worth showing. */
export const DETAIL_SIDE = 220;
/** The most things the groups opened on screen may hold: well inside what one drawing is allowed to hold. */
export const DETAIL_THINGS_MOST = 1500;

/** What decides the order: where the view looks, how big the screen is, what is open, how big each group is. */
export interface DetailAsk {
  view: FlyView;
  screen: { width: number; height: number };
  /** The groups already open. */
  opened: ReadonlySet<string>;
  /** The number of things in each group, by its id. */
  sizes: ReadonlyMap<string, number>;
  /** The group the reader chose, if any. */
  chosen?: string;
}

/** The groups to open next, in the order to open them. Empty when nothing on screen is big enough, or the screen is full. */
export function detailOrder(overview: LaidMarks, ask: DetailAsk): string[] {
  const { view, screen, opened, sizes, chosen } = ask;
  const seen = { x: view.x, y: view.y, width: screen.width / view.scale, height: screen.height / view.scale };
  const middle = { x: seen.x + seen.width / 2, y: seen.y + seen.height / 2 };
  const onScreen = overview.marks.flatMap((m) =>
    m.kind === 'group' &&
    m.x < seen.x + seen.width &&
    seen.x < m.x + m.width &&
    m.y < seen.y + seen.height &&
    seen.y < m.y + m.height
      ? [
          {
            id: m.id,
            width: m.width,
            height: m.height,
            from: Math.hypot(m.x + m.width / 2 - middle.x, m.y + m.height / 2 - middle.y),
          },
        ]
      : [],
  );
  let room = DETAIL_THINGS_MOST;
  for (const g of onScreen) if (opened.has(g.id)) room -= sizes.get(g.id) ?? 0;
  const order: string[] = [];
  const next = onScreen
    .filter((g) => !opened.has(g.id) && Math.min(g.width, g.height) * view.scale >= DETAIL_SIDE)
    .sort((a, b) => Number(b.id === chosen) - Number(a.id === chosen) || a.from - b.from || (a.id < b.id ? -1 : 1));
  for (const g of next) {
    const n = sizes.get(g.id) ?? 0;
    if (n > room) break;
    room -= n;
    order.push(g.id);
  }
  return order;
}

/**
 * The pictures of a graph drawn in steps: the overview first, then one picture for each group of `order`. Each is the
 * one before with that group's inside added. `inside` is each group laid out on its own; a group with none is skipped.
 */
export function detailFrames(
  overview: LaidMarks,
  order: readonly string[],
  inside: ReadonlyMap<string, LaidMarks>,
): LaidMarks[] {
  const frames = [overview];
  for (const id of order) {
    const laid = inside.get(id);
    if (laid) frames.push(openGroup(frames[frames.length - 1] as LaidMarks, id, laid));
  }
  return frames;
}
