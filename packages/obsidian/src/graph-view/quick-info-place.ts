// Where the quick-info tooltip goes (editor spec §24, quick_info_no_hover_only): never over the thing it speaks of. It is
// tried below the thing, above it, then to its right and its left, and takes the first place where it lies wholly on the
// page; where none does, the one that spills least — still clear of the thing. Pure: boxes in, a place out.

/** A box on the page. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The space between the thing and its tooltip, in pixels. */
const GAP = 8;

/** Where the top-left corner of a tooltip of this size goes, beside `thing`, on a page of this size. */
export function placeTip(
  thing: Box,
  size: { width: number; height: number },
  page: { width: number; height: number },
): { x: number; y: number } {
  const { width: w, height: h } = size;
  const across = (middle: number, length: number, room: number) =>
    Math.max(0, Math.min(middle - length / 2, room - length));
  const middle = { x: (thing.left + thing.right) / 2, y: (thing.top + thing.bottom) / 2 };
  const tries = [
    { x: across(middle.x, w, page.width), y: thing.bottom + GAP },
    { x: across(middle.x, w, page.width), y: thing.top - GAP - h },
    { x: thing.right + GAP, y: across(middle.y, h, page.height) },
    { x: thing.left - GAP - w, y: across(middle.y, h, page.height) },
  ];
  // how far a try spills over the page's edges
  const spill = (t: { x: number; y: number }) =>
    Math.max(0, -t.x) + Math.max(0, -t.y) + Math.max(0, t.x + w - page.width) + Math.max(0, t.y + h - page.height);
  let best = tries[0] ?? { x: 0, y: 0 };
  for (const t of tries) {
    if (spill(t) === 0) return t;
    if (spill(t) < spill(best)) best = t;
  }
  return best;
}
