// A drawn graph (spec §3): the bar — problems badge, Fit, zoom out, zoom in, Full screen, Edit — and the drawing, which
// zooms and pans by button, gesture and key (the core's Zoom decides; this passes the events in and shows the view), opens
// full screen, and shows a box's details when it is tapped or opened from the keyboard. This module ties together the
// parts in its folder: the bar, the drawing, taps, the details, and where the card is placed.
import { MarkdownRenderChild, Platform, setIcon } from 'obsidian';
import { AcrossZoom, Zoom, scrollsOneWay } from '@graph-note/core';
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
import { renderTypeStrip } from './type-strip';
import { renderTable } from './table-view';
import type { ViewOptions } from './view-options';

/** How much of the window's height a drawing scrolled across may take, at most (§15, wide_types_phone). */
const ACROSS_HEIGHT = 0.6;

/** A drawn graph with its bar, zoom, full screen, details and, in edit mode, the inspector. */
export class GraphView extends MarkdownRenderChild {
  private readonly o: ViewOptions;
  private zoom!: Zoom;
  private viewport!: HTMLElement;
  /** The drawing: Graphviz's SVG, or, for a graph drawn as a table (§15), the table. */
  private svg: SVGSVGElement | null = null;
  private table: HTMLElement | null = null;
  /** Whether the drawing scrolls across only: a wide tree, flow or timeline on a phone (§15). */
  private across = false;
  private detailsEl!: HTMLElement;
  private details!: DetailsPanel;
  private walk: Walk | null = null;
  private maker: ViewMaker | null = null;
  private adder: AddThing | null = null;
  private fullscreen: { view: GraphView; overlay: HTMLElement } | null = null;
  private boxDown: { id: number; x: number; y: number; target: Target } | null = null;
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

    list = renderProblems(root, problems, true, this.o.completeness);
    if (this.o.parked) listParked(list, this.o.parked, (k) => this.boxes().find((b) => b.key === k)?.text ?? k);
    this.walk = new Walk(root, this.o, () => this.svg ?? undefined); // walked paths: Play, and Record while edited (§7)
    if (this.o.writeView) this.maker = new ViewMaker(root, this.o); // a view made by tapping, while edited (§7)
    if (this.o.editing) this.adder = new AddThing(root, this.o); // a thing added from its text, while edited (§5)
    const view = this.o.view;
    const writes = view
      ? renderViewStrip(root, view, () => ({ view: this.zoom.view(), selected: this.details.selectedKey() }))
      : [];
    // how it is drawn, and the diagram types to choose from (§15)
    if (this.o.diagram) writes.push(...renderTypeStrip(root, this.o.diagram));
    this.viewport = root.createDiv({
      cls: 'graph-note-viewport',
      attr: {
        tabindex: '0',
        role: 'group',
        'aria-label': `Drawing of graph ${this.o.graph}: ${plural(this.o.drawn.width ? this.boxes().length : 0, 'thing')}. Plus, minus and zero zoom; Escape leaves full screen.`,
      },
    });
    // a graph drawn as a table is the plugin's own table; any other, the SVG Graphviz drew (§15)
    const table = this.o.diagram?.table;
    if (table) this.table = renderTable(this.viewport, table);
    else this.svg = insertSvg(this.viewport, this.o.drawn, this.drawing());
    if (view && this.svg) markView(this.svg, view); // a view: what is outside it faded, its looks drawn (§7)
    // the drawing as sentences, for screen readers (spec §11)
    const d = this.drawing();
    if (d) describeDrawing(root, this.viewport, d);
    this.detailsEl = root.createDiv({ cls: 'graph-note-details', attr: { role: 'region', 'aria-live': 'polite' } });
    this.detailsEl.hidden = true;
    this.details = new DetailsPanel(this.detailsEl, this.svg ?? this.table ?? this.viewport, this.viewport, this.o);
    const slot = mode === 'note' ? root.createDiv({ cls: 'graph-note-edit-slot' }) : null;

    // on a phone, a wide tree, flow or timeline is fitted to its height and scrolled across only (wide_types_phone)
    const room = Math.min(this.viewport.clientWidth || Infinity, activeWindow.innerWidth || Infinity);
    const type = this.o.diagram?.choice.drawn ?? 'network';
    this.across = mode === 'note' && scrollsOneWay(type, Platform.isPhone, this.o.drawn.width, room);
    const size = { width: this.o.drawn.width, height: this.o.drawn.height };
    this.zoom = this.across
      ? new AcrossZoom(size, this.viewportSize(), mode)
      : new Zoom(size, this.viewportSize(), mode);
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

  /**
   * The viewport's size. In a note it is as tall as the drawing fitted to its width, as a note sizes a drawing; scrolled
   * across, as tall as the drawing, up to a part of the window.
   */
  private viewportSize() {
    const width = this.viewport.clientWidth || this.o.drawn.width;
    if (this.o.mode !== 'note') return { width, height: this.viewport.clientHeight || this.o.drawn.height };
    if (this.across) return { width, height: Math.min(this.o.drawn.height, activeWindow.innerHeight * ACROSS_HEIGHT) };
    return { width, height: this.o.drawn.height * Math.min(1, width / this.o.drawn.width) };
  }

  private apply(v: View): void {
    this.svg?.setAttribute('width', String(v.width));
    this.svg?.setAttribute('height', String(v.height));
    this.table?.setCssProps({ '--graph-note-scale': String(v.scale) });
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

  private open(t: Target): void {
    // while recording a walk, or making a view, a tap chooses rather than opening details (§7)
    if ('key' in t && (this.walk?.tap(t.key) || this.maker?.tap(t.key))) return;
    if ('key' in t) this.details.showDetails(t.key);
    else if ('link' in t) this.details.showLink(t.link);
    else {
      const e = this.drawing()?.estimates[t.estimate];
      if (e) this.details.showEstimate(e, t.estimate);
    }
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
      const first = near[0] && this.svg ? targetOf(this.svg, near[0]) : null;
      if (target ?? first) this.boxDown = { id: e.pointerId, ...p, target: (target ?? first) as Target };
      const pointer = e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse';
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
      const down = this.boxDown;
      this.boxDown = null;
      if (!down || down.id !== e.pointerId || Math.hypot(p.x - down.x, p.y - down.y) >= 10) return;
      // on or near several things, a tap in the same place again chooses the next of them (§3)
      const chosen = this.taps.choose(down, this.near(down));
      this.open((chosen && this.svg ? targetOf(this.svg, chosen) : null) ?? down.target);
    });
    this.registerDomEvent(vp, 'pointercancel', (e: PointerEvent) => {
      this.boxDown = null;
      this.zoom.handle({ kind: 'cancel', id: e.pointerId });
    });
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
      if (target && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        this.open(target);
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
