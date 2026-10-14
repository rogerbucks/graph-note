// How a card's drawing is worked by pointer, wheel and keyboard (spec §3, §25): each event passed to the core's Zoom,
// which decides; a tap on or near a box or link opens it, a tap again in the same place the next of them, and a tap on
// empty space clears the selection; the highlight under the pointer and with the keyboard focus; and the details sheet
// placed again as the window and the note move. The card (graph-view.ts) binds these once it has built its parts.
import type { Component } from 'obsidian';
import type { Zoom, ZoomEvent } from '@graph-note/core';
import type { DetailsPanel } from './details-panel';
import type { Selection } from './selection';
import { onPointer } from './selection-pointer';
import { foldAt, targetAt, targetOf } from './taps';
import type { Taps, Target } from './taps';

/** What the drawing's events need of their card, all built before they are bound. */
export interface ViewportHost {
  /** The card, which registers each listener, so that it goes with the card. */
  card: Component;
  viewport: HTMLElement;
  zoom: Zoom;
  sel: Selection;
  details: DetailsPanel;
  taps: Taps;
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
    if (onPointer(e.target)) return; // the arrow to the selection is a button of its own, never the drawing (§25)
    const target = targetAt(e.target),
      p = point(e),
      near = nearTo(p);
    const first = near[0] && svg ? targetOf(svg, near[0]) : null;
    const pointer = e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse';
    sel.pressed();
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
    use(e, { kind: 'move', id: e.pointerId, ...point(e) });
  });
  card.registerDomEvent(vp, 'pointerup', (e: PointerEvent) => {
    if (onPointer(e.target)) return;
    const p = point(e);
    use(e, { kind: 'up', id: e.pointerId, ...p, time: e.timeStamp ?? 0 });
    const down = boxDown,
      empty = emptyDown,
      folded = foldDown;
    boxDown = emptyDown = foldDown = null;
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
    zoom.handle({ kind: 'cancel', id: e.pointerId });
  });
  // the highlight under the pointer, for as long as it stays; a finger is not hovering (§25)
  card.registerDomEvent(vp, 'pointerover', (e: PointerEvent) => sel.over(e));
  card.registerDomEvent(vp, 'pointerout', (e: PointerEvent) => sel.out(e));
  // and the same highlight with the keyboard focus, which a click's focus is not
  card.registerDomEvent(vp, 'focusin', (e: FocusEvent) => sel.focusIn(e));
  card.registerDomEvent(vp, 'focusout', (e: FocusEvent) => sel.focusOut(e));
  card.registerDomEvent(
    vp,
    'wheel',
    (e: WheelEvent) => {
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      use(e, { kind: 'wheel', ...point(e), dy, ctrl: e.ctrlKey, meta: e.metaKey });
    },
    { passive: false },
  );
  // a double click on or near a box or link only selects it, as its two clicks did; only empty space zooms (§3)
  card.registerDomEvent(vp, 'dblclick', (e: MouseEvent) => {
    if (onPointer(e.target)) return;
    const p = point(e),
      onBox = !!targetAt(e.target);
    use(e, { kind: 'dblclick', ...p, onBox, near: !onBox && nearTo(p).length > 0 });
  });
  card.registerDomEvent(vp, 'keydown', (e: KeyboardEvent) => {
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
