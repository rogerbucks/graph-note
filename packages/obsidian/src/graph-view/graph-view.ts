// A drawn graph (spec §3): the bar — problems badge, Fit, zoom out, zoom in, Full screen, Edit — and the drawing, which
// zooms and pans by button, gesture and key (the core's Zoom decides; this passes the events in and shows the view), opens
// full screen, and shows a box's details when it is tapped or opened from the keyboard. This module ties together the
// parts in its folder: the bar, the drawing, taps, the details, and where the card is placed.
import { MarkdownRenderChild, setIcon } from 'obsidian';
import { Zoom } from '@graph-note/core';
import type { View, ZoomEvent } from '@graph-note/core';
import { renderCode } from '../code';
import { readOnlyHere, whenPlaced } from './placement';
import { gateWrites } from './read-only';
import { renderProblems } from './problems-list';
import { listParked } from './parked';
import { Walk } from './walk';
import { ViewMaker } from './view-maker';
import { AddThing } from './add-thing';
import { toggleExportForm } from '../export/export-form';
import { markView, renderViewStrip } from './view-strip';
import { plural, renderBar } from './view-bar';
import { describeDrawing, insertSvg } from './drawing-svg';
import { Taps, targetAt, targetOf } from './taps';
import type { Target } from './taps';
import { DetailsPanel } from './details-panel';
import { Selection } from './selection';
import type { ViewOptions } from './view-options';

/** A drawn graph with its bar, zoom, full screen, details and, in edit mode, the inspector. */
export class GraphView extends MarkdownRenderChild {
  private readonly o: ViewOptions;
  private zoom!: Zoom;
  private viewport!: HTMLElement;
  private svg!: SVGSVGElement;
  private detailsEl!: HTMLElement;
  private details!: DetailsPanel;
  private walk: Walk | null = null;
  private maker: ViewMaker | null = null;
  private adder: AddThing | null = null;
  private fullscreen: { view: GraphView; overlay: HTMLElement } | null = null;
  private boxDown: { id: number; x: number; y: number; target: Target; touch: boolean } | null = null;
  /** A press on empty space: if it lifts where it came down, it is a tap there, which clears the focus (§25). */
  private emptyDown: { id: number; x: number; y: number } | null = null;
  /** The selection and so the focus, the highlight, and untangling the drawing (§25). */
  private sel!: Selection;
  private editButton: HTMLButtonElement | null = null;
  private readonly taps: Taps;
  private codeEl: HTMLElement | null = null;
  private readonly readOnly: () => boolean;

  constructor(containerEl: HTMLElement, options: ViewOptions) {
    super(containerEl);
    // whether the card is where the note is only read: in reading view, or opened from a card that is (spec §3)
    this.readOnly = () => !!options.readOnly?.() || (options.mode === 'note' && readOnlyHere(containerEl));
    // every write the card can make goes through that one check: none where the card is read-only; and the card's parts
    // are given the same check as `readOnly`, so a control that writes is not offered at all there
    this.o = gateWrites({ ...options, readOnly: this.readOnly }, this.readOnly);
    this.taps = new Taps(options.drawn.svg);
  }

  override onload(): void {
    const { problems, mode } = this.o,
      root = this.containerEl;
    root.addClass('graph-note-view', `is-${mode}`);

    let list: HTMLElement | null = null;
    const placed = renderBar(root, this.o, {
      toggleProblems: (badge) => {
        if (!list) return;
        list.hidden = !list.hidden;
        badge.setAttribute('aria-expanded', String(!list.hidden));
      },
      fit: () => this.zoom.fit(),
      zoomOut: () => this.zoom.zoomOut(),
      zoomIn: () => this.zoom.zoomIn(),
      find: (b) => this.sel.untangle.toggleFind(b),
      legend: (b) => this.sel.untangle.toggleLegend(b),
      fullScreen: () => this.openFullscreen(),
      editHere: () => (this.o.editing?.()?.session ? this.o.onDoneEditing?.() : this.o.onEditHere?.()),
      toggleSource: (b) => this.toggleSource(b),
      export: () => this.o.exporting && toggleExportForm(root, this.o.exporting),
    });
    const { editing, source } = placed;
    this.editButton = placed.editButton;
    if (this.editButton) {
      this.showEditing();
      if (this.o.watchEditing)
        this.register(
          this.o.watchEditing(() => {
            this.showEditing();
            this.details.refresh();
          }),
        );
    }

    // finding a thing, the legend and the banner of an untangled drawing sit under the bar (§25); they change the picture only
    this.sel = new Selection(root, this.o, {
      svg: () => this.svg,
      zoom: () => this.zoom,
      details: () => this.details,
      open: (t, walking) => this.open(t, false, walking),
      taps: this.taps,
      drawing: () => this.drawing(),
    });

    list = renderProblems(root, problems, true, this.o.completeness);
    if (this.o.parked) listParked(list, this.o.parked, (k) => this.boxes().find((b) => b.key === k)?.text ?? k);
    this.walk = new Walk(root, this.o, () => this.svg); // walked paths: Play, and Record while edited (§7)
    if (this.o.writeView) this.maker = new ViewMaker(root, this.o); // a view made by tapping, while edited (§7)
    if (this.o.editing) this.adder = new AddThing(root, this.o); // a thing added from its text, while edited (§5)
    const view = this.o.view;
    const writes = view
      ? renderViewStrip(root, view, () => ({ view: this.zoom.view(), selected: this.details.selectedKey() }))
      : [];
    this.viewport = root.createDiv({
      cls: 'graph-note-viewport',
      attr: {
        tabindex: '0',
        role: 'group',
        'aria-label': `Drawing of graph ${this.o.graph}: ${plural(this.o.drawn.width ? this.boxes().length : 0, 'thing')}. Plus, minus and zero zoom; Escape leaves full screen.`,
      },
    });
    this.svg = insertSvg(this.viewport, this.o.drawn, this.drawing());
    if (view) markView(this.svg, view); // a view: what is outside it faded, its looks drawn (§7)
    // the drawing as sentences, for screen readers (spec §11)
    const d = this.drawing();
    if (d) describeDrawing(root, this.viewport, d);
    this.detailsEl = root.createDiv({ cls: 'graph-note-details', attr: { role: 'region', 'aria-live': 'polite' } });
    this.detailsEl.hidden = true;
    this.details = new DetailsPanel(this.detailsEl, this.svg, this.viewport, this.o, this.sel.actions());
    // closing the details, by button, Escape or a tap on empty space, clears the selection and the focus with them (§25)
    this.details.onClosed = () => this.sel.closed();
    const slot = mode === 'note' ? root.createDiv({ cls: 'graph-note-edit-slot' }) : null;

    this.zoom = new Zoom({ width: this.o.drawn.width, height: this.o.drawn.height }, this.viewportSize(), mode);
    this.zoom.onChange = (v) => this.apply(v);
    this.zoom.onExit = () => this.o.onClose?.();
    // a view saved as shown is shown so again (§7)
    const was = view?.shown;
    if (was?.zoom !== undefined) this.zoom.restore(was.zoom, was.x ?? 0, was.y ?? 0);
    this.apply(this.zoom.view());
    this.bindEvents();
    const observer = new ResizeObserver(() => this.zoom.resize(this.viewportSize()));
    observer.observe(this.viewport);
    this.register(() => observer.disconnect());
    if (mode === 'full') this.viewport.focus();
    // what the card offers depends on where it is: in reading view it is read-only, with Source in place of Edit
    let gone = false;
    this.register(() => (gone = true));
    whenPlaced(
      root,
      () => {
        if (this.readOnly()) {
          [...editing, ...writes].forEach((b) => b.remove());
          this.editButton = null;
          slot?.remove();
          this.showEditing(); // Record and Make a view, built before the card was placed, offered no more
          if (was?.selected) this.open({ key: was.selected }); // a view saved as shown opens with its selection here too
          return;
        }
        source?.remove();
        if (slot) this.o.onReady?.(slot);
        const reopen = this.o.editing?.()?.selected ?? (was?.selected ? { key: was.selected } : null);
        if (reopen) this.open(reopen);
      },
      () => !gone,
    );
  }

  /** Source, in reading view: the block's text, coloured and read-only, in place of the drawing; and back. */
  private toggleSource(b: HTMLButtonElement): void {
    const showing = !this.viewport.hidden;
    if (!this.codeEl) {
      this.codeEl = renderCode(this.containerEl, this.o.source ?? '');
      this.containerEl.insertBefore(this.codeEl, this.detailsEl);
      this.codeEl.hidden = true;
    }
    this.viewport.hidden = showing;
    this.codeEl.hidden = !showing;
    if (showing) this.detailsEl.hidden = true;
    b.empty();
    setIcon(b, showing ? 'network' : 'code');
    b.setAttribute('aria-label', showing ? 'Show drawing' : 'Show source');
  }

  /** The edit button as the card stands: a pencil to edit here, or, while edited, a view icon to finish (spec §4). */
  private showEditing(): void {
    this.walk?.show(); // Record and Make a view are offered only while the card is edited
    this.maker?.show();
    this.adder?.show();
    const b = this.editButton;
    if (!b) return;
    const on = !!this.o.editing?.()?.session;
    b.empty();
    setIcon(b, on ? 'book-open' : 'pencil');
    b.setAttribute('aria-label', on ? 'Done editing' : 'Edit here');
  }

  override onunload(): void {
    this.fullscreen?.overlay.remove();
    this.fullscreen = null;
  }

  private drawing() {
    return this.o.reading.graphs.get(this.o.graph);
  }

  private boxes() {
    return this.o.reading.graphs.get(this.o.graph)?.boxes ?? [];
  }

  /** The viewport's size. In a note it is as tall as the drawing fitted to its width, as a note sizes a drawing. */
  private viewportSize() {
    const width = this.viewport.clientWidth || this.o.drawn.width;
    if (this.o.mode !== 'note') return { width, height: this.viewport.clientHeight || this.o.drawn.height };
    return { width, height: this.o.drawn.height * Math.min(1, width / this.o.drawn.width) };
  }

  private apply(v: View): void {
    this.svg.setAttribute('width', String(v.width));
    this.svg.setAttribute('height', String(v.height));
    this.viewport.setCssProps({
      '--graph-note-x': `${v.x}px`,
      '--graph-note-y': `${v.y}px`,
      '--graph-note-height': `${this.viewportSize().height}px`,
      '--graph-note-touch': this.zoom.touchAction(),
    });
    this.viewport.toggleClass('is-zoomed', this.zoom.zoomedIn());
  }

  private point(e: { clientX: number; clientY: number }) {
    const r = this.viewport.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** What a tap at a point in the viewport reaches, nearest first (tap_cycles_near, §3). */
  private near(p: { x: number; y: number }): string[] {
    return this.taps.near(p, this.zoom.view());
  }

  /**
   * Opens a box or link; with `extend` (Shift), a second thing asks for the shortest path from the one selected (§25). An
   * arrow key's `walking` only moves the selection: it never answers a question for a second thing.
   */
  private open(t: Target, extend = false, walking = false): void {
    // while recording a walk, or making a view, a tap chooses rather than opening details (§7)
    if ('key' in t && (this.walk?.tap(t.key) || this.maker?.tap(t.key))) return;
    if ('key' in t && !walking && this.sel.second(t.key, extend)) return;
    if ('key' in t) this.details.showDetails(t.key);
    else if ('link' in t) this.details.showLink(t.link);
    else {
      const e = this.drawing()?.estimates[t.estimate];
      if (e) this.details.showEstimate(e, t.estimate);
    }
    // the selection is the focus: it, its links and what is at their other ends stay at full strength (§25)
    this.sel.select(t);
    // while the block is edited, where it is written is selected in the text — an estimate's misspelt word too (§4)
    this.o.onSelect?.('key' in t ? { thing: t.key } : t);
  }

  private bindEvents(): void {
    const vp = this.viewport;
    const use = (e: Event, ev: ZoomEvent) => {
      if (this.zoom.handle(ev)) {
        e.preventDefault();
        return true;
      }
      return false;
    };
    this.registerDomEvent(vp, 'pointerdown', (e: PointerEvent) => {
      const target = targetAt(e.target),
        p = this.point(e),
        near = this.near(p);
      const first = near[0] ? targetOf(this.svg, near[0]) : null;
      const pointer = e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse';
      this.sel.pressed();
      if (target ?? first)
        this.boxDown = { id: e.pointerId, ...p, target: (target ?? first) as Target, touch: pointer !== 'mouse' };
      else this.emptyDown = { id: e.pointerId, ...p };
      if (use(e, { kind: 'down', id: e.pointerId, pointer, ...p, onBox: !!target, near: !target && near.length > 0 })) {
        vp.setPointerCapture(e.pointerId);
        vp.focus({ preventScroll: true });
      }
    });
    this.registerDomEvent(vp, 'pointermove', (e: PointerEvent) => {
      use(e, { kind: 'move', id: e.pointerId, ...this.point(e) });
    });
    this.registerDomEvent(vp, 'pointerup', (e: PointerEvent) => {
      const p = this.point(e);
      use(e, { kind: 'up', id: e.pointerId, ...p, time: e.timeStamp ?? 0 });
      const down = this.boxDown,
        empty = this.emptyDown;
      this.boxDown = this.emptyDown = null;
      // a tap on empty space clears the selection and the focus (§25); a drag across it only pans
      if (empty && empty.id === e.pointerId && Math.hypot(p.x - empty.x, p.y - empty.y) < 10) this.sel.clear();
      if (!down || down.id !== e.pointerId || Math.hypot(p.x - down.x, p.y - down.y) >= 10) return;
      // on or near several things, a tap in the same place again chooses the next of them (§3)
      const chosen = this.taps.choose(down, this.near(down));
      this.open((chosen ? targetOf(this.svg, chosen) : null) ?? down.target, e.shiftKey);
      // on touch there is no hover: the tap that selects gives the highlight (§25)
      this.sel.touched(down.touch);
    });
    this.registerDomEvent(vp, 'pointercancel', (e: PointerEvent) => {
      this.boxDown = this.emptyDown = null;
      this.zoom.handle({ kind: 'cancel', id: e.pointerId });
    });
    // the highlight under the pointer, for as long as it stays; a finger is not hovering (§25)
    this.registerDomEvent(vp, 'pointerover', (e: PointerEvent) => this.sel.over(e));
    this.registerDomEvent(vp, 'pointerout', (e: PointerEvent) => this.sel.out(e));
    // and the same highlight with the keyboard focus, which a click's focus is not
    this.registerDomEvent(vp, 'focusin', (e: FocusEvent) => this.sel.focusIn(e));
    this.registerDomEvent(vp, 'focusout', (e: FocusEvent) => this.sel.focusOut(e));
    this.registerDomEvent(
      vp,
      'wheel',
      (e: WheelEvent) => {
        const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
        use(e, { kind: 'wheel', ...this.point(e), dy, ctrl: e.ctrlKey, meta: e.metaKey });
      },
      { passive: false },
    );
    // a double click on or near a box or link only selects it, as its two clicks did; only empty space zooms (§3)
    this.registerDomEvent(vp, 'dblclick', (e: MouseEvent) => {
      const p = this.point(e),
        onBox = !!targetAt(e.target);
      use(e, { kind: 'dblclick', ...p, onBox, near: !onBox && this.near(p).length > 0 });
    });
    this.registerDomEvent(vp, 'keydown', (e: KeyboardEvent) => {
      const target = targetAt(e.target);
      // Escape clears the selection and the focus first; with a thing selected the arrow keys walk its links (§25)
      const used = this.sel.key(e);
      if (target && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        this.open(target);
        return;
      }
      if (used) {
        e.preventDefault();
        return;
      }
      use(e, { kind: 'key', key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey });
    });
  }

  private openFullscreen(): void {
    if (this.fullscreen) return;
    const overlay = activeDocument.body.createDiv({
      cls: 'graph-note-fullscreen',
      attr: { role: 'dialog', 'aria-modal': 'true', 'aria-label': `Graph ${this.o.graph}, full screen` },
    });
    const view = new GraphView(overlay.createDiv({ cls: 'graph-note' }), {
      ...this.o,
      mode: 'full',
      onClose: () => this.closeFullscreen(),
      readOnly: this.readOnly, // full screen opened in reading view is read-only too
    });
    this.fullscreen = { view, overlay };
    this.addChild(view);
  }

  private closeFullscreen(): void {
    const f = this.fullscreen;
    if (!f) return;
    this.fullscreen = null;
    this.removeChild(f.view);
    f.overlay.remove();
    this.viewport.focus();
  }
}
