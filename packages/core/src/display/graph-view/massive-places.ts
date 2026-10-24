// The overview of a graph opened again keeps its groups where they were (editor spec §53, scale_layout_static). An edit
// draws the card again. The groups the edit did not touch must not move. So each graph's last overview is kept here,
// and the new one is put on it (core layout-static.ts). A graph with fewer than half of its groups the same is laid
// out afresh.
import type { LaidMarks } from '../../graphviz-marks.ts';
import { keepPlaces } from '../../layout-static.ts';

/** How many graphs' last overviews are kept. */
const KEPT_MOST = 8;
const last = new Map<string, LaidMarks>();

/** `now`, the overview of graph `graph`, with each group that was in its last overview where it was. */
export function placesKept(graph: string, now: LaidMarks): LaidMarks {
  const before = last.get(graph);
  const ids = (laid: LaidMarks) => new Set(laid.marks.filter((m) => m.kind === 'group').map((m) => m.id));
  const there = before ? ids(before) : new Set<string>();
  const same = [...ids(now)].filter((id) => there.has(id)).length;
  const kept = before && same * 2 >= there.size ? keepPlaces(before, now) : now;
  last.delete(graph);
  last.set(graph, kept);
  for (const [name] of last) if (last.size > KEPT_MOST) last.delete(name);
  return kept;
}
