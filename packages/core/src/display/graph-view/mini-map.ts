// The mini-map (editor spec §24, mini_map, mini_map_setting): a small copy of the whole drawing in a corner of its
// view. The part in view is outlined, and moves the view when it is tapped or dragged. It shows by the setting: never,
// only when the drawing is bigger than its view (the default), or always. It is drawn from the same areas a tap
// reaches, as a box for each thing and a line for each link. So it is a copy of the layout and never lays anything out.
// Its look is the style sheet's alone (`thoughtknot-mini-*`). Pointer only: the drawing is moved from the keyboard by
// its own keys.
//
// It always shows the whole drawing, however tall or wide (Roger, 23 Oct 2026). Its long side is capped. Its short side
// is kept readable while the whole drawing still fits in that cap.
import { hitAreas, word } from '@thoughtknot/core';
import type { Drawn, HitAreas, MiniMapSetting, Size, View, Zoom } from '@thoughtknot/core';
import type { Lifecycle } from '../lifecycle';
import { make } from './note-callouts';

/** The longest side of the copy, in pixels, for a drawing of an ordinary shape. */
const LONGEST = 120;
/** The shortest side of the copy, in pixels, kept while the whole drawing still fits in the longest. */
const SHORTEST = 48;
/** The longest side of the copy for a tall or wide drawing, in pixels. */
const TALLEST = 200;

/** The copy's size in pixels for a drawing of this size: always the whole drawing (mini_map_shape). */
export function miniScale(width: number, height: number): Size {
  const long = Math.max(width, height);
  const k = Math.min(TALLEST / long, Math.max(LONGEST / long, SHORTEST / Math.min(width, height)));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
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
    const { width, height } = miniScale(vb.width, vb.height);
    const svg = make('svg', {
      class: 'thoughtknot-mini-svg',
      viewBox: `${vb.x} ${vb.y} ${vb.width} ${vb.height}`,
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
  }

  /** Puts the middle of the view where the pointer is on the copy, as far as the drawing's edges allow. */
  private moveTo(e: PointerEvent): void {
    const r = this.svg?.getBoundingClientRect(),
      vb = this.areas?.viewBox;
    if (!r?.width || !r.height || !vb?.width || !vb.height) return;
    const zoom = this.host.zoom(),
      v = zoom.view(),
      size = this.host.size();
    const fx = clamp((e.clientX - r.left) / r.width),
      fy = clamp((e.clientY - r.top) / r.height);
    // a drag on the drawing pans freely (pan_freely), but a tap here goes to a part of it, so it shows no empty space
    const edged = (to: number, length: number, room: number) =>
      length <= room ? (room - length) / 2 : Math.min(0, Math.max(room - length, to));
    zoom.panBy(
      edged(size.width / 2 - fx * v.width, v.width, size.width) - v.x,
      edged(size.height / 2 - fy * v.height, v.height, size.height) - v.y,
    );
  }
}
