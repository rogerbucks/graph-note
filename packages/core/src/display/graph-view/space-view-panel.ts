// The 3D view of a card's drawing (editor spec §53, scale_space_view). Roger, 22 Oct 2026: a view you switch to from
// the bar, never the default, so people can explore a graph in depth. It lies over the drawing and goes on Back to 2D
// or Escape. It only looks: nothing is edited here, and nothing reaches the note.
//
// It reads the drawing already on screen: each box, group and link of the SVG, with the colours the theme gave them.
// So it lays nothing out, and looks like the card in light and dark. The numbers live in core space-view.ts, and the
// painters in space-painter.ts and space-gpu-painter.ts.
//
// Height means one of two things, switched by a button:
// - groups: each group is a floor, and things stand on their group;
// - links: each thing is as tall as its count of links, so the busiest things stand out.
// Drag to turn, scroll to zoom, double-click a thing to fly to it. The keyboard does the same: arrows turn and
// tilt, + and - zoom, Home shows it all again. What is picked is said aloud.
import { word } from '@thoughtknot/core';
import type { DrawMark } from '../../drawing-marks.ts';
import { blockAt, focusOn, labelsOnScreen, orbitBy, orbitFit, spaceMatrix, spaceOf, zoomBy } from '../../space-view.ts';
import type { DepthBy, Orbit, SpaceMarks } from '../../space-view.ts';
import { pickPainter } from './mark-painter.ts';
import { webgl2SpacePainter } from './space-painter.ts';
import { canvasSpacePainter, paintSpaceLabels } from './space-canvas-painter.ts';
import type { SpacePainter } from './space-painter.ts';
import { webgpuSpacePainter } from './space-gpu-painter.ts';
import { button } from './view-bar';
import { marksOfSvg } from './svg-marks.ts';

/** How far a key press turns or tilts the camera, as a drag of this many pixels would. */
const KEY_STEP = 24;

/** Each thing's count of links, by its key: what height means when it means links. */
function linkCounts(marks: readonly DrawMark[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of marks)
    if (m.kind === 'link')
      for (const end of [m.from, m.to]) if (end !== undefined) counts.set(end, (counts.get(end) ?? 0) + 1);
  return counts;
}

/**
 * Opens the 3D view of `svg` over `root`, the card. It gives back how to close it, or null where the device can paint
 * no 3D at all. `closed` is called once it closes, by its button, by Escape, or by the card.
 */
export async function openSpaceView(
  root: HTMLElement,
  svg: SVGSVGElement,
  graph: string,
  closed: () => void,
): Promise<(() => void) | null> {
  const { marks, paints } = marksOfSvg(svg);
  const el = root.createDiv({
    cls: 'thoughtknot-space-view',
    attr: { tabindex: '0', role: 'img', 'aria-label': word('space.name', { graph }) },
  });
  const shapes = el.createEl('canvas', { cls: 'thoughtknot-space-canvas' }),
    words = el.createEl('canvas', { cls: 'thoughtknot-space-canvas' });
  const painter = await pickPainter<SpacePainter>(shapes, [webgpuSpacePainter, webgl2SpacePainter, canvasSpacePainter]);
  const ctx = words.getContext('2d');
  if (!painter || !ctx) {
    el.remove();
    return null;
  }
  const bar = el.createDiv({ cls: 'thoughtknot-space-bar', attr: { role: 'toolbar' } });
  const said = el.createDiv({ cls: 'thoughtknot-space-said', attr: { 'aria-live': 'polite' } });
  const win = el.win;
  const halo = win.getComputedStyle(root).backgroundColor || 'Canvas';
  const depths: DepthBy[] = [{ by: 'group' }, { by: 'size', sizes: linkCounts(marks) }];
  let depth = marks.some((m) => m.kind === 'group') ? 0 : 1;
  let space: SpaceMarks = spaceOf(marks, depths[depth] as DepthBy);
  let width = 1,
    height = 1;
  let orbit: Orbit = orbitFit(space, 1);
  let asked = false;
  let open = true;

  const paint = () => {
    asked = false;
    if (!open) return;
    const reach = Math.hypot(space.most[0] - space.least[0], space.most[1] - space.least[1], space.most[2]);
    const matrix = spaceMatrix(orbit, width / height, reach);
    painter.paint(space, matrix, paints);
    paintSpaceLabels(ctx, labelsOnScreen(space, matrix, width, height), paints, win.devicePixelRatio || 1, halo);
  };
  const again = () => {
    if (asked) return;
    asked = true;
    win.requestAnimationFrame(paint);
  };
  const resize = () => {
    width = Math.max(1, el.clientWidth);
    height = Math.max(1, el.clientHeight);
    const ratio = win.devicePixelRatio || 1;
    painter.resize(width, height, ratio);
    words.width = Math.round(width * ratio);
    words.height = Math.round(height * ratio);
    again();
  };
  const sizer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  sizer?.observe(el);

  const close = () => {
    if (!open) return;
    open = false;
    sizer?.disconnect();
    painter.destroy();
    el.remove();
    closed();
  };
  const depthWords = () => word(depth === 0 ? 'space.height-groups' : 'space.height-links');
  button(bar, word('space.flatten'), 'square', close, word('space.flatten'));
  const depthButton = button(
    bar,
    depthWords(),
    'bar-chart-3',
    () => {
      depth = (depth + 1) % depths.length;
      space = spaceOf(marks, depths[depth] as DepthBy);
      const label = depthWords();
      depthButton.setAttribute('aria-label', label);
      depthButton.querySelector<HTMLElement>('.thoughtknot-badge-text')?.setText(label);
      said.setText(label);
      again();
    },
    depthWords(),
  );

  let dragging: { id: number; x: number; y: number } | null = null;
  el.addEventListener('pointerdown', (e) => {
    if ((e.target as Element | null)?.closest('.thoughtknot-space-bar')) return;
    dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging || dragging.id !== e.pointerId) return;
    orbit = orbitBy(orbit, e.clientX - dragging.x, e.clientY - dragging.y);
    dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
    again();
  });
  const letGo = () => (dragging = null);
  el.addEventListener('pointerup', letGo);
  el.addEventListener('pointercancel', letGo);
  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      orbit = zoomBy(orbit, Math.pow(1.0015, -e.deltaY));
      again();
    },
    { passive: false },
  );
  el.addEventListener('dblclick', (e) => {
    const at = el.getBoundingClientRect();
    const reach = Math.hypot(space.most[0] - space.least[0], space.most[1] - space.least[1], space.most[2]);
    const picked = blockAt(
      space,
      spaceMatrix(orbit, width / height, reach),
      width,
      height,
      e.clientX - at.left,
      e.clientY - at.top,
    );
    if (!picked) return;
    const top = picked.floor + picked.tall;
    const near = Math.max(picked.width, picked.depth, picked.tall) * 4;
    orbit = focusOn(orbit, [picked.x + picked.width / 2, picked.y + picked.depth / 2, top], near);
    said.setText(picked.name ?? picked.of ?? '');
    again();
  });
  el.addEventListener('keydown', (e) => {
    const turns: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    };
    const turn = turns[e.key];
    if (turn) orbit = orbitBy(orbit, ...turn);
    else if (e.key === '+' || e.key === '=') orbit = zoomBy(orbit, 1.25);
    else if (e.key === '-') orbit = zoomBy(orbit, 0.8);
    else if (e.key === 'Home') orbit = orbitFit(space, width / height);
    else if (e.key === 'Escape') return close();
    else return;
    e.preventDefault();
    again();
  });

  resize();
  orbit = orbitFit(space, width / height);
  el.focus();
  return close;
}
