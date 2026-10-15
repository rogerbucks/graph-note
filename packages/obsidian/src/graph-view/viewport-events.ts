// How a card's drawing is worked by pointer, wheel and keyboard (spec §3, §25): each event passed to the core's Zoom,
// which decides; a tap on or near a box or link opens it, a tap again in the same place the next of them, and a tap on
// empty space clears the selection; the highlight under the pointer and with the keyboard focus; and the details sheet
// placed again as the window and the note move. The card (graph-view.ts) binds these once it has built its parts.
import type { Component } from 'obsidian';
import type { Zoom, ZoomEvent } from '@graph-note/core';
import type { DetailsPanel } from './details-panel';
import type { Selection } from './selection';
import { onPointer } from './selection-pointer';
import { onImageControl } from './animated-images';
import { onMiniMap } from './mini-map';
import type { QuickInfo } from './quick-info';
import { foldAt, targetAt, targetOf } from './taps';
import type { Taps, Target } from './taps';

/** Whether an event came from a control of the drawing's own — the arrow to the selection (§25), an image's control (§18), the mini-map (§24). */
const ownButton = (target: EventTarget | null): boolean =>
  onPointer(target) || onImageControl(target) || onMiniMap(target);

/** What the drawing's events need of their card, all built before they are bound. */
export interface ViewportHost {
  /** The card, which registers each listener, so that it goes with the card. */
  card: Component;
  viewport: HTMLElement;
  zoom: Zoom;
  sel: Selection;
  details: DetailsPanel;
  taps: Taps;
  /** The quick-info tooltip (§24): opened by a hover, a long press and the keyboard focus, closed by a press or Escape. */
  info: QuickInfo;
  /** The drawing's SVG; none for a graph drawn as a table (§15). */
  svg: SVGSVGElement | null;
  /** Opens a box or link; with `extend` (Shift), a second thing asks for the shortest path from the one selected (§25). */
  open: (t: Target, extend?: boolean) => void;
  /** Opens a busy hub's stub or a folded group's box (§25), by its `data-fold`; `byKey` when the keyboard opened it. */
  unfold: (fold: string, byKey?: boolean) => void;
}

/** Binds the drawing's pointer, wheel, focus and key events, and the window's and note's that move the details sheet. */
export function bindViewportEvents(host: ViewportHost): void {
  const { card, viewport: vp, zoom, sel, details, taps, svg } = host;
  let boxDown: { id: number; x: number; y: number; target: Target; touch: boolean } | null = null;
  /** A press on empty space: if it lifts where it came down, it is a tap there, which clears the focus (§25). */
  let emptyDown: { id: number; x: number; y: number } | null = null;
  /** A press on a fold's stub or box: if it lifts where it came down, it opens the fold (§25). */
  let foldDown: { id: number; x: number; y: number; fold: string } | null = null;
  const point = (e: { clientX: number; clientY: number }) => {
    const r = vp.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  // what a tap at a point in the viewport reaches, nearest first (tap_cycles_near, §3)
  const nearTo = (p: { x: number; y: number }): string[] => taps.near(p, zoom.view());
  const use = (e: Event, ev: ZoomEvent) => {
    if (zoom.handle(ev)) {
      // the wheel, a zoom key or a double click takes over from a move under way, which would fight it (§25)
      if (ev.kind === 'wheel' || ev.kind === 'key' || ev.kind === 'dblclick') sel.stop();
      e.preventDefault();
      return true;
    }
    return false;
  };
  // the details sheet is placed again as the window changes size and the note scrolls (§25)
  card.registerDomEvent(vp.win, 'resize', () => details.moved(true));
  card.registerDomEvent(vp.doc, 'scroll', () => details.moved(false), { capture: true, passive: true });
  card.registerDomEvent(vp, 'pointerdown', (e: PointerEvent) => {
    if (ownButton(e.target)) return; // the arrow to the selection, an image's control: buttons of their own (§25, §18)
    const target = targetAt(e.target),
      p = point(e),
      near = nearTo(p);
    const first = near[0] && svg ? targetOf(svg, near[0]) : null;
    const pointer = e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse';
    sel.pressed();
    host.info.pressed(e); // any tooltip closes; a finger held on a thing or link opens it (§24)
    const fold = foldAt(e.target);
    if (fold) foldDown = { id: e.pointerId, ...p, fold };
    else if (target ?? first)
      boxDown = { id: e.pointerId, ...p, target: (target ?? first) as Target, touch: pointer !== 'mouse' };
    else emptyDown = { id: e.pointerId, ...p };
    if (use(e, { kind: 'down', id: e.pointerId, pointer, ...p, onBox: !!target, near: !target && near.length > 0 })) {
      vp.setPointerCapture(e.pointerId);
      vp.focus({ preventScroll: true });
    }
  });
  card.registerDomEvent(vp, 'pointermove', (e: PointerEvent) => {
    if (onMiniMap(e.target)) return; // the mini-map moves the view by itself (§24)
    host.info.moved(e);
    use(e, { kind: 'move', id: e.pointerId, ...point(e) });
  });
  card.registerDomEvent(vp, 'pointerup', (e: PointerEvent) => {
    if (ownButton(e.target)) return;
    const p = point(e);
    use(e, { kind: 'up', id: e.pointerId, ...p, time: e.timeStamp ?? 0 });
    const down = boxDown,
      empty = emptyDown,
      folded = foldDown;
    boxDown = emptyDown = foldDown = null;
    if (host.info.released(e.pointerId)) return; // a finger held on a thing opened its tooltip: the lift is not a tap (§24)
    if (folded && folded.id === e.pointerId && Math.hypot(p.x - folded.x, p.y - folded.y) < 10)
      host.unfold(folded.fold);
    // a tap on empty space clears the selection and the focus (§25); a drag across it only pans
    if (empty && empty.id === e.pointerId && Math.hypot(p.x - empty.x, p.y - empty.y) < 10) sel.clear();
    if (!down || down.id !== e.pointerId || Math.hypot(p.x - down.x, p.y - down.y) >= 10) return;
    // on or near several things, a tap in the same place again chooses the next of them (§3)
    const chosen = taps.choose(down, nearTo(down));
    host.open((chosen && svg ? targetOf(svg, chosen) : null) ?? down.target, e.shiftKey);
    // on touch there is no hover: the tap that selects gives the highlight (§25)
    sel.touched(down.touch);
  });
  card.registerDomEvent(vp, 'pointercancel', (e: PointerEvent) => {
    boxDown = emptyDown = foldDown = null;
    host.info.released(e.pointerId);
    zoom.handle({ kind: 'cancel', id: e.pointerId });
  });
  // the highlight under the pointer, for as long as it stays; a finger is not hovering (§25)
  // and the quick-info tooltip after a moment (§24)
  card.registerDomEvent(vp, 'pointerover', (e: PointerEvent) => {
    sel.over(e);
    host.info.over(e);
  });
  card.registerDomEvent(vp, 'pointerout', (e: PointerEvent) => {
    sel.out(e);
    host.info.out(e);
  });
  // and the same highlight, and tooltip, with the keyboard focus, which a click's focus is not
  card.registerDomEvent(vp, 'focusin', (e: FocusEvent) => {
    sel.focusIn(e);
    host.info.focusIn(e);
  });
  card.registerDomEvent(vp, 'focusout', (e: FocusEvent) => {
    sel.focusOut(e);
    host.info.focusOut();
  });
  card.registerDomEvent(
    vp,
    'wheel',
    (e: WheelEvent) => {
      host.info.hide(); // the drawing is about to move from under it
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      use(e, { kind: 'wheel', ...point(e), dy, ctrl: e.ctrlKey, meta: e.metaKey });
    },
    { passive: false },
  );
  // a double click on or near a box or link only selects it, as its two clicks did; only empty space zooms (§3)
  card.registerDomEvent(vp, 'dblclick', (e: MouseEvent) => {
    if (ownButton(e.target)) return;
    const p = point(e),
      onBox = !!targetAt(e.target);
    use(e, { kind: 'dblclick', ...p, onBox, near: !onBox && nearTo(p).length > 0 });
  });
  card.registerDomEvent(vp, 'keydown', (e: KeyboardEvent) => {
    host.info.key(e); // Escape closes a tooltip, and goes on to do what it did (§24)
    // Enter and Space press an image's control, never the box it is on (§18)
    if (onImageControl(e.target) && (e.key === 'Enter' || e.key === ' ')) return;
    const target = targetAt(e.target),
      fold = foldAt(e.target);
    // Enter or Space on a fold's stub or box opens it (§25)
    if (fold && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      host.unfold(fold, true);
      return;
    }
    // Escape clears the selection and the focus first; with a thing selected the arrow keys walk its links (§25)
    const used = sel.key(e);
    if (target && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      host.open(target);
      return;
    }
    if (used) {
      e.preventDefault();
      return;
    }
    use(e, { kind: 'key', key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey });
  });
}
