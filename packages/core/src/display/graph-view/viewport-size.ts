// The size of a card's viewport (spec §3, §15, §25): how large the drawing's viewport is drawn, and the size the zoom is
// told. In a note it is as tall as the drawing fitted to its width, as a note sizes a drawing. It goes up to the share
// of the window the settings allow (note_height_capped). A taller drawing is fitted inside it, so what follows it stays
// in reach. Scrolled across, it is as tall as the drawing, up to a smaller part of the window. The page may have given
// a viewport no size yet, or no longer. The card may be hidden by display: none or another tab, or not yet laid out.
// Then it is drawn at the drawing's own size, but the zoom is told it has none. So it keeps its view, a zoom saved as
// shown among it, for when the card shows (zoom_fit_recomputed).
import type { Mode, Size } from '@thoughtknot/core';

/** How much of the window's height a drawing scrolled across may take, at most (§15, wide_types_phone). */
const ACROSS_HEIGHT = 0.6;

/** How much of the window's height a drawing in a note may take when the card is given no setting (§3). */
const NOTE_HEIGHT = 0.75;

/** The viewport's size to draw it at: the drawing's own size stands in for a size the page has not given it. */
export function viewportSize(
  viewport: HTMLElement,
  drawn: Size,
  mode: Mode,
  across: boolean,
  tallest: number | null = NOTE_HEIGHT,
): Size {
  const width = viewport.clientWidth || drawn.width;
  if (mode !== 'note') return { width, height: viewport.clientHeight || drawn.height };
  const most = activeWindow.innerHeight * (tallest ?? Infinity);
  if (across) return { width, height: Math.min(drawn.height, activeWindow.innerHeight * ACROSS_HEIGHT, most) };
  return { width, height: Math.min(drawn.height * Math.min(1, width / drawn.width), most) };
}

/**
 * The viewport's size to tell the zoom: none at all while the page gives it none, so the zoom keeps its own view. Full
 * screen and the pane are as tall as the page makes them. A thing's details can squeeze them to no height. That is no
 * size too, so closing the details gives back the zoom and place the drawing had (details_keep_view).
 */
export function zoomSize(
  viewport: HTMLElement,
  drawn: Size,
  mode: Mode,
  across: boolean,
  tallest?: number | null,
): Size {
  const squeezed = mode !== 'note' && !viewport.clientHeight;
  return viewport.clientWidth && !squeezed
    ? viewportSize(viewport, drawn, mode, across, tallest)
    : { width: 0, height: 0 };
}
