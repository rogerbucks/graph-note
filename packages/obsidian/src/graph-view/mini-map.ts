// The mini-map (editor spec §24, mini_map, mini_map_setting): a small copy of the whole drawing in a corner of its view,
// with the part in view outlined, which moves the view when it is tapped or dragged. It shows by the setting: never, only
// when the drawing is bigger than its view (the default), or always. It is drawn from the same areas a tap reaches, as a box
// for each thing and a line for each link, so it is a copy of the layout and never lays anything out; its look is the style
// sheet's alone (`graph-note-mini-*`). Pointer only: the drawing is moved from the keyboard by its own keys.
import { hitAreas } from '@graph-note/core';
import type { Drawn, HitAreas, MiniMapSetting, Size, View, Zoom } from '@graph-note/core';
import type { Component } from 'obsidian';
import { make } from './note-callouts';

/** The longest side of the copy, in pixels. */
const LONGEST = 120;

/** Whether an event's target is the mini-map, which a press on is never a press on the drawing. */
export const onMiniMap = (target: EventTarget | null): boolean =>
  !!(target as Element | null)?.closest?.('.graph-note-mini-map');

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
  constructor(viewport: HTMLElement, card: Component, host: MiniMapHost) {
    this.host = host;
    this.el = viewport.createDiv({
      cls: 'graph-note-mini-map',
      attr: { role: 'img', 'aria-label': 'Mini-map of the whole drawing. Tap or drag it to move the view.' },
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
    const k = LONGEST / Math.max(vb.width, vb.height);
    const svg = make('svg', {
      class: 'graph-note-mini-svg',
      viewBox: `${vb.x} ${vb.y} ${vb.width} ${vb.height}`,
      width: Math.round(vb.width * k),
      height: Math.round(vb.height * k),
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
            class: 'graph-note-mini-box',
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
              class: 'graph-note-mini-line',
              points: line.map(([x, y]) => `${x},${y}`).join(' '),
              fill: 'none',
            }),
          );
    }
    this.frame = make('rect', { class: 'graph-note-mini-frame', x: vb.x, y: vb.y, width: vb.width, height: vb.height });
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
    for (const [name, value] of [
      ['x', vb.x + x0 * vb.width],
      ['y', vb.y + y0 * vb.height],
      ['width', (x1 - x0) * vb.width],
      ['height', (y1 - y0) * vb.height],
    ] as const)
      this.frame.setAttribute(name, String(value));
  }

  /** Puts the middle of the view where the pointer is on the copy, as far as the drawing's edges allow. */
  private moveTo(e: PointerEvent): void {
    const r = this.svg?.getBoundingClientRect();
    if (!r?.width || !r.height) return;
    const zoom = this.host.zoom(),
      v = zoom.view(),
      size = this.host.size();
    const fx = clamp((e.clientX - r.left) / r.width),
      fy = clamp((e.clientY - r.top) / r.height);
    zoom.panBy(size.width / 2 - fx * v.width - v.x, size.height / 2 - fy * v.height - v.y);
  }
}
