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
// How to move it is on screen (space-controls.ts says each way): a help line at the foot, and buttons to zoom, turn
// and reset. Drag turns, Shift-drag or right-drag moves, scroll zooms; on touch, one finger turns and two move and
// pinch. A click or tap picks a thing and names it; a double one flies to it. The keyboard does the same. What is
// picked is said aloud, and its name always shows (space-labels.ts).
import { word } from '@thoughtknot/core';
import type { DrawMark } from '../../drawing-marks.ts';
import { blockAt, focusOn, orbitBy, orbitFit, spaceMatrix, spaceOf, zoomBy } from '../../space-view.ts';
import type { Block, DepthBy, Orbit, SpaceMarks } from '../../space-view.ts';
import { labelsOnScreen } from '../../space-labels.ts';
import { KEY_STEP, ZOOM_STEP, keyMove, panBy, twoFingers } from '../../space-controls.ts';
import type { SpaceMove, Touch } from '../../space-controls.ts';
import { pickPainter } from './mark-painter.ts';
import type { Paints } from './mark-painter.ts';
import { webgl2SpacePainter } from './space-painter.ts';
import { canvasSpacePainter, paintSpaceLabels } from './space-canvas-painter.ts';
import type { SpacePainter } from './space-painter.ts';
import { webgpuSpacePainter } from './space-gpu-painter.ts';
import { button } from './view-bar';
import { marksOfSvg } from './svg-marks.ts';

/** The close of the 3D view open on each card, so a second press of 3D view closes it rather than stacking one more. */
const opened = new WeakMap<HTMLElement, () => void>();

/** How far a pointer may move, in pixels, and still be a click or tap rather than a drag. */
const TAP_SLOP = 6;
/** How soon a second click or tap must follow the first to fly, in milliseconds. */
const DOUBLE_TAP = 350;

/** Each thing's count of links, by its key: what height means when it means links. */
function linkCounts(marks: readonly DrawMark[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of marks)
    if (m.kind === 'link')
      for (const end of [m.from, m.to]) if (end !== undefined) counts.set(end, (counts.get(end) ?? 0) + 1);
  return counts;
}

/**
 * Opens the 3D view over `root`, the card. It is of `from`: the drawing's SVG, or marks already read, such as an
 * overview's, with their paints. It gives back how to close it, or null where the device can paint no 3D at all.
 * `closed` is called once it closes, by its button, by Escape, or by the card.
 */
export async function openSpaceView(
  root: HTMLElement,
  from: SVGSVGElement | { marks: DrawMark[]; paints: Paints },
  graph: string,
  closed: () => void,
): Promise<(() => void) | null> {
  const already = opened.get(root);
  if (already) {
    already();
    return null;
  }
  const { marks, paints } = 'marks' in from ? from : marksOfSvg(from);
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
  // a card with no background of its own shows the page's: the label halo uses the system's page colour then
  const background = win.getComputedStyle(root).backgroundColor;
  const halo = !background || background === 'transparent' || /,\s*0\)$/.test(background) ? 'Canvas' : background;
  const depths: DepthBy[] = [{ by: 'group' }, { by: 'size', sizes: linkCounts(marks) }];
  let depth = marks.some((m) => m.kind === 'group') ? 0 : 1;
  let space: SpaceMarks = spaceOf(marks, depths[depth] as DepthBy);
  let width = 1,
    height = 1;
  let orbit: Orbit = orbitFit(space, 1);
  let asked = false;
  let open = true;
  // the picked thing, by its key: its name always shows, and Enter flies to it
  let picked: Block | null = null;

  const reachOf = () => Math.hypot(space.most[0] - space.least[0], space.most[1] - space.least[1], space.most[2]);
  const matrixNow = () => spaceMatrix(orbit, width / height, reachOf());
  const paint = () => {
    asked = false;
    if (!open) return;
    const matrix = matrixNow();
    painter.paint(space, matrix, paints);
    const named = labelsOnScreen(space, matrix, width, height, picked?.of === undefined ? {} : { picked: picked.of });
    paintSpaceLabels(ctx, named, paints, win.devicePixelRatio || 1, halo);
  };
  const again = () => {
    if (asked) return;
    asked = true;
    win.requestAnimationFrame(paint);
  };
  const resize = () => {
    // the card was drawn again or closed, which its size shows: the view goes with it, and frees the graphics chip
    if (!el.isConnected) return close();
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
    opened.delete(root);
    sizer?.disconnect();
    painter.destroy();
    el.remove();
    closed();
  };

  /** Makes one move, from a key or a button, and paints it. */
  const move = (m: SpaceMove) => {
    if ('back' in m) return close();
    if ('turn' in m) orbit = orbitBy(orbit, ...m.turn);
    else if ('pan' in m) orbit = panBy(orbit, ...m.pan, height);
    else if ('zoom' in m) orbit = zoomBy(orbit, m.zoom);
    else if ('reset' in m) orbit = orbitFit(space, width / height);
    else if ('help' in m) showHelp(help.hidden !== false);
    again();
  };
  /** Picks `block`, or none: its name shows and is said aloud. */
  const pick = (block: Block | null) => {
    picked = block;
    said.setText(block ? (block.name ?? block.of ?? '') : '');
    again();
  };
  /** Flies to `block`: the camera looks at its top from near. */
  const flyTo = (block: Block) => {
    const top = block.floor + block.tall;
    const near = Math.max(block.width, block.depth, block.tall) * 4;
    orbit = focusOn(orbit, [block.x + block.width / 2, block.y + block.depth / 2, top], near);
    pick(block);
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
      picked = picked && (space.blocks.find((b) => b.id === picked?.id) ?? null);
      const label = depthWords();
      depthButton.setAttribute('aria-label', label);
      depthButton.querySelector<HTMLElement>('.thoughtknot-badge-text')?.setText(label);
      said.setText(label);
      again();
    },
    depthWords(),
  );

  // the buttons that move the view, for those who would rather press than drag
  const pad = el.createDiv({
    cls: 'thoughtknot-space-pad',
    attr: { role: 'toolbar', 'aria-label': word('space.moves') },
  });
  button(pad, word('space.zoom-in'), 'zoom-in', () => move({ zoom: ZOOM_STEP }));
  button(pad, word('space.zoom-out'), 'zoom-out', () => move({ zoom: 1 / ZOOM_STEP }));
  button(pad, word('space.turn-left'), 'rotate-ccw', () => move({ turn: [-KEY_STEP * 2, 0] }));
  button(pad, word('space.turn-right'), 'rotate-cw', () => move({ turn: [KEY_STEP * 2, 0] }));
  button(pad, word('space.tilt-up'), 'chevron-up', () => move({ turn: [0, -KEY_STEP] }));
  button(pad, word('space.tilt-down'), 'chevron-down', () => move({ turn: [0, KEY_STEP] }));
  button(pad, word('space.reset'), 'maximize', () => move({ reset: true }));
  const helpButton = button(pad, word('space.help'), 'help-circle', () => move({ help: true }));

  // how to move it, in short steps, shown when it opens; touch screens get the touch words
  const help = el.createEl('ul', { cls: 'thoughtknot-space-help' });
  const touch = win.matchMedia?.('(pointer: coarse)').matches ?? false;
  for (const key of touch ? TOUCH_HELP : MOUSE_HELP) help.createEl('li', { text: word(key) });
  const showHelp = (show: boolean) => {
    help.hidden = !show;
    helpButton.setAttribute('aria-pressed', String(show));
  };
  showHelp(true);

  // pointers down now, by id: one turns, or moves with Shift or the right button; two move and pinch
  const down = new Map<number, Touch>();
  let pans = false,
    travel = 0,
    lastTap: { at: number; x: number; y: number } | null = null;
  const pinch = () => [...down.values()].slice(0, 2) as [Touch, Touch];
  el.addEventListener('pointerdown', (e) => {
    if ((e.target as Element | null)?.closest('.thoughtknot-space-bar, .thoughtknot-space-pad')) return;
    down.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (down.size === 1) {
      pans = e.shiftKey || e.button === 1 || e.button === 2;
      travel = 0;
    }
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    const was = down.get(e.pointerId);
    if (!was) return;
    const now = { x: e.clientX, y: e.clientY };
    if (down.size >= 2) {
      const before = pinch();
      down.set(e.pointerId, now);
      const { dx, dy, zoom } = twoFingers(before, pinch());
      orbit = zoomBy(panBy(orbit, dx, dy, height), zoom);
      travel += TAP_SLOP;
    } else {
      down.set(e.pointerId, now);
      const dx = now.x - was.x,
        dy = now.y - was.y;
      travel += Math.abs(dx) + Math.abs(dy);
      orbit = pans || e.shiftKey ? panBy(orbit, dx, dy, height) : orbitBy(orbit, dx, dy);
    }
    again();
  });
  const letGo = (e: PointerEvent) => {
    if (!down.delete(e.pointerId)) return;
    if (e.type !== 'pointerup' || down.size > 0 || travel > TAP_SLOP) return;
    // a click or tap: picks the thing under it; a second one soon after, in the same place, flies to it
    const at = el.getBoundingClientRect();
    const hit = blockAt(space, matrixNow(), width, height, e.clientX - at.left, e.clientY - at.top);
    const twice =
      lastTap &&
      e.timeStamp - lastTap.at < DOUBLE_TAP &&
      Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < TAP_SLOP * 4;
    lastTap = twice ? null : { at: e.timeStamp, x: e.clientX, y: e.clientY };
    if (twice && hit) flyTo(hit);
    else pick(hit);
  };
  el.addEventListener('pointerup', letGo);
  el.addEventListener('pointercancel', letGo);
  // a right-drag moves the view, so the right button opens no menu here
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      // a pinch on a trackpad comes as a scroll with Ctrl held, in small steps: it zooms faster
      orbit = zoomBy(orbit, Math.pow(e.ctrlKey ? 1.01 : 1.0015, -e.deltaY));
      again();
    },
    { passive: false },
  );
  el.addEventListener('keydown', (e) => {
    if ((e.target as Element | null)?.closest('button')) {
      // a button keeps Enter and Space for itself
      if (e.key === 'Enter' || e.key === ' ') return;
    }
    if (e.key === 'Enter' && picked) flyTo(picked);
    else {
      const m = keyMove(e.key, e.shiftKey);
      if (!m) return;
      move(m);
    }
    e.preventDefault();
  });

  opened.set(root, close);
  resize();
  orbit = orbitFit(space, width / height);
  el.focus();
  return close;
}

/** The help line's steps, with a mouse or trackpad. */
const MOUSE_HELP = [
  'space.help-drag',
  'space.help-move',
  'space.help-zoom',
  'space.help-pick',
  'space.help-keys',
] as const;
/** The help line's steps, on a touch screen. */
const TOUCH_HELP = ['space.help-finger', 'space.help-fingers', 'space.help-tap'] as const;
