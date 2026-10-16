// Where a property's type menu is shown (spec §14, inspector_native): under the type icon that opened it, or, when the
// window has no room below, above it, so every item stays on screen. The host's own menu places itself from the position
// it is given; it is given one that already fits, from the icon's rectangle and an estimate of the menu's height.

/** Where a menu is shown: its top left, in pixels from the window's own. */
export interface MenuPosition {
  x: number;
  y: number;
}

/** The part of an element's rectangle the placement needs. */
export interface Anchor {
  left: number;
  top: number;
  bottom: number;
}

/** An estimated height of one menu row, in pixels, on a desktop and on a phone, and of the menu's padding. */
const ROW = 32,
  ROW_PHONE = 44,
  PAD = 16;

/**
 * The position to show a menu of `rows` rows at, for an icon at `anchor` in a window `innerHeight` high: its top left under
 * the icon; else its bottom edge at the icon's top; else (no room either side) as low as the window lets it go.
 */
export function menuPosition(anchor: Anchor, rows: number, innerHeight: number, phone: boolean): MenuPosition {
  const height = rows * (phone ? ROW_PHONE : ROW) + PAD;
  if (anchor.bottom + height <= innerHeight) return { x: anchor.left, y: anchor.bottom };
  if (anchor.top - height >= 0) return { x: anchor.left, y: anchor.top - height };
  return { x: anchor.left, y: Math.max(0, innerHeight - height) };
}
