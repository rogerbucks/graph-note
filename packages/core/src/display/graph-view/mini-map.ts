// The mini-map (editor spec §24, mini_map, mini_map_setting): a small copy of the whole drawing in a corner of its
// view. The part in view is outlined, and moves the view when it is tapped or dragged. It shows by the setting: never,
// only when the drawing is bigger than its view (the default), or always. It is drawn from the same areas a tap
// reaches, as a box for each thing and a line for each link. So it is a copy of the layout and never lays anything out.
// Its look is the style sheet's alone (`thoughtknot-mini-*`). Pointer only: the drawing is moved from the keyboard by
// its own keys.
//
// A tall or wide drawing is not squeezed to a sliver. The copy keeps a readable short side, and its long side is capped,
// so it shows a window onto the drawing. The window slides with the view, the way a code editor's mini-map does, and
// holds still while a pointer drags on it.
import { hitAreas, word } from '@thoughtknot/core';
import type { Drawn, HitAreas, MiniMapSetting, Size, View, Zoom } from '@thoughtknot/core';
import type { Lifecycle } from '../lifecycle';
import { make } from './note-callouts';

/** The longest side of the copy, in pixels, for a drawing of an ordinary shape. */
const LONGEST = 120;
/** The shortest side of the copy, in pixels: a tall or wide drawing is drawn this wide (or tall) at least. */
const SHORTEST = 48;
/** The longest side of the copy for a tall or wide drawing, in pixels; the rest of it is reached by sliding. */
const TALLEST = 200;

/** How a drawing of this size is copied: the copy's size in pixels, and how much of the drawing it shows at once. */
export function miniScale(width: number, height: number): { width: number; height: number; shows: Size } {
  const k = Math.max(LONGEST / Math.max(width, height), SHORTEST / Math.min(width, height));
  const fit = (length: number) => (length * k > TALLEST ? [TALLEST, TALLEST / k] : [Math.round(length * k), length]);
  const [w = 0, across = width] = fit(width),
    [h = 0, down = height] = fit(height);
  return { width: w, height: h, shows: { width: across, height: down } };
}

/** Where a window of `room` sits on a drawing from `start`, `length` long, for an outline at `at`, `size` long. It works
 * like a scroll bar. An outline at the top puts the window at the top, and one at the bottom puts it at the bottom. So
 * an outline that fits in the window is always inside it. */
function slide(at: number, size: number, room: number, start: number, length: number): number {
  if (room >= length) return start;
  const travel = length - size;
  return start + (travel > 0 ? clamp((at - start) / travel) : 0) * (length - room);
}

/** Whether an event's target is the mini-map, which a press on is never a press on the drawing. */
export const onMiniMap = (target: EventTarget | null): boolean =>
  !!(target as Element | null)?.closest?.('.thoughtknot-mini-map');

/** What the mini-map asks of its card, given late because the card builds them after it. */
export interface MiniMapHost {
  setting: () => MiniMapSetting;
  zoom: () => Zoom;
  /** The viewport's size as the zoom has it: none while the card is hidden. */
  size: () => Size;
}

const clamp = (n: number): number => Math.max(0, Math.min(1, n));

/** The mini-map of one drawing. */
export class MiniMap {
  private readonly el: HTMLElement;
  private svg: SVGSVGElement | null = null;
  private frame: SVGRectElement | null = null;
  private areas: HitAreas | null = null;
  /** The part of the drawing the copy shows, in the drawing's units: all of it unless the drawing is tall or wide. */
  private window = { x: 0, y: 0, width: 0, height: 0 };
  /** The pointer that is dragging on it, if one is. */
  private drag: number | null = null;
  private readonly host: MiniMapHost;

  /** For the viewport it sits in, the card (which owns its listeners), and what it asks of the card. */
  constructor(viewport: HTMLElement, card: Lifecycle, host: MiniMapHost) {
    this.host = host;
    this.el = viewport.createDiv({
      cls: 'thoughtknot-mini-map',
      attr: { role: 'img', 'aria-label': word('drawing.mini-map') },
    });
    this.el.hidden = true;
    card.registerDomEvent(this.el, 'pointerdown', (e: PointerEvent) => {
      if (e.button) return;
      this.drag = e.pointerId;
      this.el.setPointerCapture(e.pointerId);
      e.preventDefault();
      this.moveTo(e);
    });
    card.registerDomEvent(this.el, 'pointermove', (e: PointerEvent) => {
      if (this.drag === e.pointerId) this.moveTo(e);
    });
    const end = (e: PointerEvent) => {
      if (this.drag !== e.pointerId) return;
      this.drag = null;
      this.el.releasePointerCapture(e.pointerId);
      this.update(this.host.zoom().view()); // the window, held still while dragged, catches up
    };
    card.registerDomEvent(this.el, 'pointerup', end);
    card.registerDomEvent(this.el, 'pointercancel', end);
  }

  /** The drawing as laid out now, copied small. Nothing is shown until `update` says so. */
  redrawn(drawn: Drawn): void {
    this.el.empty();
    this.svg = this.frame = null;
    this.areas = hitAreas(drawn.svg);
    const { viewBox: vb, shapes } = this.areas;
    if (!vb.width || !vb.height) return;
    const { width, height, shows } = miniScale(vb.width, vb.height);
    this.window = { x: vb.x, y: vb.y, ...shows };
    const svg = make('svg', {
      class: 'thoughtknot-mini-svg',
      viewBox: `${vb.x} ${vb.y} ${this.window.width} ${this.window.height}`,
      width,
      height,
      'aria-hidden': 'true',
    });
    for (const s of shapes) {
      if (s.kind === 'node') {
        const pts = [...s.polygons, ...s.lines].flat();
        if (!pts.length) continue;
        const xs = pts.map(([x]) => x),
          ys = pts.map(([, y]) => y);
        const x = Math.min(...xs),
          y = Math.min(...ys);
        svg.appendChild(
          make('rect', {
            class: 'thoughtknot-mini-box',
            x,
            y,
            width: Math.max(...xs) - x,
            height: Math.max(...ys) - y,
          }),
        );
      } else
        for (const line of s.lines)
          svg.appendChild(
            make('polyline', {
              class: 'thoughtknot-mini-line',
              points: line.map(([x, y]) => `${x},${y}`).join(' '),
              fill: 'none',
            }),
          );
    }
    this.frame = make('rect', {
      class: 'thoughtknot-mini-frame',
      x: vb.x,
      y: vb.y,
      width: vb.width,
      height: vb.height,
    });
    svg.appendChild(this.frame);
    this.el.appendChild(svg);
    this.svg = svg;
  }

  /** The view changed, or the setting's reading of it: shown or hidden, and the part in view outlined. */
  update(v: View): void {
    const size = this.host.size(),
      vb = this.areas?.viewBox,
      setting = this.host.setting();
    const bigger = size.width > 0 && size.height > 0 && (v.width > size.width + 0.5 || v.height > size.height + 0.5);
    const show =
      !!this.frame && !!vb && v.width > 0 && v.height > 0 && (setting === 'always' || (setting === 'auto' && bigger));
    this.el.hidden = !show;
    if (!show || !this.frame || !vb) return;
    // the part of the drawing the viewport holds, as fractions of the drawing
    const covers = (at: number, length: number, room: number) =>
      room > 0 ? [clamp(-at / length), clamp((room - at) / length)] : [0, 1];
    const [x0 = 0, x1 = 1] = covers(v.x, v.width, size.width),
      [y0 = 0, y1 = 1] = covers(v.y, v.height, size.height);
    const fx = vb.x + x0 * vb.width,
      fy = vb.y + y0 * vb.height,
      fw = (x1 - x0) * vb.width,
      fh = (y1 - y0) * vb.height;
    for (const [name, value] of [
      ['x', fx],
      ['y', fy],
      ['width', fw],
      ['height', fh],
    ] as const)
      this.frame.setAttribute(name, String(value));
    // the window slides with the outline, but holds still under a dragging pointer
    if (this.drag !== null || !this.svg) return;
    const w = this.window;
    w.x = slide(fx, fw, w.width, vb.x, vb.width);
    w.y = slide(fy, fh, w.height, vb.y, vb.height);
    this.svg.setAttribute('viewBox', `${w.x} ${w.y} ${w.width} ${w.height}`);
  }

  /** Puts the middle of the view where the pointer is on the copy, as far as the drawing's edges allow. A pointer
   * dragged past the copy's edge keeps going, so the parts of a tall drawing outside the window are reached too. */
  private moveTo(e: PointerEvent): void {
    const r = this.svg?.getBoundingClientRect(),
      vb = this.areas?.viewBox,
      w = this.window;
    if (!r?.width || !r.height || !vb?.width || !vb.height) return;
    const zoom = this.host.zoom(),
      v = zoom.view(),
      size = this.host.size();
    const fx = clamp((w.x + ((e.clientX - r.left) / r.width) * w.width - vb.x) / vb.width),
      fy = clamp((w.y + ((e.clientY - r.top) / r.height) * w.height - vb.y) / vb.height);
    zoom.panBy(size.width / 2 - fx * v.width - v.x, size.height / 2 - fy * v.height - v.y);
  }
}
