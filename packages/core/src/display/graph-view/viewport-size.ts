// The size of a card's viewport (spec §3, §15, §25): how large the drawing's viewport is drawn, and the size the zoom is
// told. In a note it is as tall as the drawing fitted to its width, as a note sizes a drawing; scrolled across, as tall
// as the drawing, up to a part of the window. A viewport the page has given no size yet, or no longer — a card hidden
// by display: none or another tab, or not yet laid out — is drawn at the drawing's own size, but the zoom is told it has
// none, so it keeps its view, a zoom saved as shown among it, for when the card shows (zoom_fit_recomputed).
import type { Mode, Size } from '@graph-note/core';

/** How much of the window's height a drawing scrolled across may take, at most (§15, wide_types_phone). */
const ACROSS_HEIGHT = 0.6;

/** The viewport's size to draw it at: the drawing's own size stands in for a size the page has not given it. */
export function viewportSize(viewport: HTMLElement, drawn: Size, mode: Mode, across: boolean): Size {
  const width = viewport.clientWidth || drawn.width;
  if (mode !== 'note') return { width, height: viewport.clientHeight || drawn.height };
  if (across) return { width, height: Math.min(drawn.height, activeWindow.innerHeight * ACROSS_HEIGHT) };
  return { width, height: drawn.height * Math.min(1, width / drawn.width) };
}

/** The viewport's size to tell the zoom: none at all while the page gives it none, so the zoom keeps its own view. */
export function zoomSize(viewport: HTMLElement, drawn: Size, mode: Mode, across: boolean): Size {
  return viewport.clientWidth ? viewportSize(viewport, drawn, mode, across) : { width: 0, height: 0 };
}
