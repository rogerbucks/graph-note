// A drawn graph (spec §3): the bar — problems badge, Fit, zoom out, zoom in, Full screen, Edit — and the drawing, which
// zooms and pans by button, gesture and key (the core's Zoom decides; this passes the events in and shows the view), opens
// full screen, and shows a box's details when it is tapped or opened from the keyboard. This module ties together the
// parts in its folder: the bar, the drawing, taps, the details, and where the card is placed.
import { MarkdownRenderChild, Platform, setIcon } from 'obsidian';
import { AcrossZoom, Zoom, scrollsOneWay } from '@graph-note/core';
import type { Drawn, View } from '@graph-note/core';
import { renderCode } from '../code';
import { readOnlyHere, whenPlaced } from './placement';
import { gateWrites } from './read-only';
import { renderProblems } from './problems-list';
import { listParked } from './parked';
import { Walk } from './walk';
import { playablePaths } from './path-play';
import { ViewMaker } from './view-maker';
import { AddThing } from './add-thing';
import { toggleExportForm } from '../export/export-form';
import { markView, renderViewStrip } from './view-strip';
import { markProposal } from '../proposals/mark-proposal';
import { renderProposalStrip } from '../proposals/proposal-strip';
import { plural, renderBar } from './view-bar';
import { describeDrawing, insertSvg, swapSvg } from './drawing-svg';
import { ViewSwitching } from './view-switches';
import { markFlow, renderFlowLegend } from './flow-marks';
import { Taps, boxIn } from './taps';
import type { Target } from './taps';
import { DetailsPanel } from './details-panel';
import { Selection } from './selection';
import { renderTypeStrip } from './type-strip';
import { renderTable } from './table-view';
import { bindViewportEvents } from './viewport-events';
import { viewportSize, zoomSize } from './viewport-size';
import type { ViewOptions } from './view-options';

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
  /** The selection and so the focus, the highlight, and untangling the drawing (§25). */
  private sel!: Selection;
  private editButton: HTMLButtonElement | null = null;
  private readonly taps: Taps;
  private codeEl: HTMLElement | null = null;
  private readonly readOnly: () => boolean;
  /** The drawing as laid out now: the one given, or the one a View menu switch laid out since (§25). */
  private drawn: Drawn;
  /** The View menu and what its switches do (§25); none for a graph drawn as a table. */
  private switching: ViewSwitching | null = null;
  private unloaded = false;
  /** Where the legend of moving links is (§7). */
  private legendSlot!: HTMLElement;

  constructor(containerEl: HTMLElement, options: ViewOptions) {
    super(containerEl);
    // whether the card is where the note is only read: in reading view, or opened from a card that is (spec §3)
    this.readOnly = () => !!options.readOnly?.() || (options.mode === 'note' && readOnlyHere(containerEl));
    // every write the card can make goes through that one check: none where the card is read-only; and the card's parts
    // are given the same check as `readOnly`, so a control that writes is not offered at all there
    this.o = gateWrites({ ...options, readOnly: this.readOnly }, this.readOnly);
    this.taps = new Taps(options.drawn.svg);
    this.drawn = options.drawn;
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
      view: (b) => this.switching?.menu.toggle(b),
      fullScreen: () => this.openFullscreen(),
      editHere: () => (this.o.editing?.()?.session ? this.o.onDoneEditing?.() : this.o.onEditHere?.()),
      toggleSource: (b) => this.toggleSource(b),
      export: () => this.o.exporting && toggleExportForm(root, { ...this.o.exporting, paths: this.playable() }),
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
      viewport: () => this.viewport,
      size: () => this.viewportSize(),
      unfoldTo: (key, then) => !!this.switching?.unfoldTo(key, then),
    });
    // the View menu's switches, under the bar with the rest that change the picture only (§25)
    if (this.o.switches)
      this.switching = new ViewSwitching(
        root,
        this.o.switches,
        { drawing: () => this.drawing(), relaid: (d) => this.relaid(d), shown: () => this.apply(this.zoom.view()) },
        this,
      );

    list = renderProblems(root, problems, true, this.o.completeness);
    if (this.o.parked) listParked(list, this.o.parked, (k) => this.boxes().find((b) => b.key === k)?.text ?? k);
    this.walk = new Walk(root, this.o, () => this.svg ?? undefined); // walked paths: Play, and Record while edited (§7)
    if (this.o.writeView) this.maker = new ViewMaker(root, this.o); // a view made by tapping, while edited (§7)
    if (this.o.editing) this.adder = new AddThing(root, this.o); // a thing added from its text, while edited (§5)
    const view = this.o.view;
    const writes: HTMLElement[] = view
      ? renderViewStrip(root, view, () => this.sel.shownNow(this.zoom.view(), this.details.selectedKey()))
      : [];
    // a proposal laid over the graph (§17): who proposed it and the changes to accept or reject, which reading view takes away
    if (this.o.proposal) writes.push(...renderProposalStrip(root, this.o.proposal));
    // how it is drawn, and the diagram types to choose from (§15)
    if (this.o.diagram) writes.push(...renderTypeStrip(root, this.o.diagram));
    // what its moving links mean, in words beside their icons (§7, motion_not_alone): only those drawn, never a link folded
    // into a stub or a box (§25), so its slot is filled again whenever the View menu lays the graph out again
    this.legendSlot = root.createDiv({ cls: 'graph-note-flow-legend-slot' });
    this.flowLegend();
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
    else this.svg = insertSvg(this.viewport, this.o.drawn, this.drawing(), this.o.switches?.state.plan, this.o);
    if (this.svg && this.o.motion) markFlow(this.svg, this.o.motion.flow); // the links its style moves (§7)
    if (view && this.svg) markView(this.svg, view); // a view: what is outside it faded, its looks drawn (§7)
    if (view?.shown?.legend?.length) this.sel.refresh(); // and its legend's choices, as it was saved as shown (§25)
    if (this.o.proposal && this.svg) markProposal(this.svg, this.o.proposal.shown.marks); // a proposal: what it adds, changes, removes (§17)
    // the drawing as sentences, for screen readers (spec §11)
    const d = this.drawing();
    if (d) describeDrawing(root, this.viewport, d);
    this.detailsEl = root.createDiv({ cls: 'graph-note-details', attr: { role: 'region', 'aria-live': 'polite' } });
    this.detailsEl.hidden = true;
    const sw = this.switching;
    this.details = new DetailsPanel(this.detailsEl, this.svg ?? this.table ?? this.viewport, this.viewport, this.o, {
      ...this.sel.actions(),
      // a busy hub's details open or fold its links (§25)
      ...(sw ? { hub: (k: string) => sw.hub(k), toggleHub: (k: string) => sw.toggleHub(k) } : {}),
    });
    if (this.svg) this.details.pictures(this.svg); // the pictures its style draws on boxes (§18)
    // closing the details, by button, Escape or a tap on empty space, clears the selection and the focus with them (§25)
    this.details.onClosed = () => this.sel.closed();
    this.details.view = () => this.zoom.view(); // where a link that takes the card's tab leaves it (§18)
    const slot = mode === 'note' ? root.createDiv({ cls: 'graph-note-edit-slot' }) : null;

    // on a phone, a wide tree, flow or timeline is fitted to its height and scrolled across only (wide_types_phone)
    const room = Math.min(this.viewport.clientWidth || Infinity, activeWindow.innerWidth || Infinity);
    const type = this.o.diagram?.choice.drawn ?? 'network';
    this.across = mode === 'note' && scrollsOneWay(type, Platform.isPhone, this.o.drawn.width, room);
    const size = { width: this.o.drawn.width, height: this.o.drawn.height };
    this.zoom = this.across ? new AcrossZoom(size, this.zoomSize(), mode) : new Zoom(size, this.zoomSize(), mode);
    this.zoom.onChange = (v) => this.apply(v);
    this.zoom.onExit = () => this.o.onClose?.();
    // a view saved as shown is shown so again (§7); a card a link took the tab from, as it was left (§18)
    const was = view?.shown ?? this.o.links?.cameBack();
    if (was?.zoom !== undefined) this.zoom.restore(was.zoom, was.x ?? 0, was.y ?? 0);
    this.apply(this.zoom.view());
    const { viewport, zoom, sel, details, taps, svg } = this;
    const open = (t: Target, x?: boolean) => this.open(t, x),
      unfold = (fold: string, byKey?: boolean) =>
        this.switching?.unfold(fold, byKey ? (key) => boxIn(this.svg, key)?.focus({ preventScroll: true }) : undefined);
    bindViewportEvents({ card: this, viewport, zoom, sel, details, taps, svg, open, unfold });
    const observer = new ResizeObserver(() => this.zoom.resize(this.zoomSize()));
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
    this.unloaded = true;
    // a move under way ends with the card, and the sheet's watchers with it; a card unloaded before it was built has none
    (this.sel as Selection | undefined)?.stop();
    (this.details as DetailsPanel | undefined)?.unload();
    this.walk?.stop(); // a path playing on its own stops with its card: no step waits on the clock
    this.fullscreen?.overlay.remove();
    this.fullscreen = null;
  }

  private drawing() {
    return this.o.reading.graphs.get(this.o.graph);
  }

  private boxes() {
    return this.o.reading.graphs.get(this.o.graph)?.boxes ?? [];
  }

  /** The paths that can be played, which the Export form offers as animated SVGs (§7). */
  private playable() {
    return playablePaths(this.o.reading, this.o.graph);
  }

  /** The viewport's size to draw it at (viewport-size.ts). */
  private viewportSize() {
    return viewportSize(this.viewport, this.drawn, this.o.mode, this.across);
  }

  /** The viewport's size to tell the zoom: none while hidden or not yet laid out, so the zoom keeps its view (§25). */
  private zoomSize() {
    return zoomSize(this.viewport, this.drawn, this.o.mode, this.across);
  }

  /**
   * The graph laid out again, as a View menu switch, a stub or a box asks (§25): put in the same SVG element, marked as
   * a view or a proposal marks it, sized and tapped afresh, the selection, its focus and its details kept, and the
   * keyboard back on the box or link it was on (view_switch_view_only).
   */
  private relaid(drawn: Drawn): void {
    const svg = this.svg;
    if (!svg || this.unloaded) return; // a card gone while its layout ran has nothing to put it in
    const was = activeDocument.activeElement,
      on = was && svg.contains(was) ? was.getAttribute('id') : null;
    this.drawn = drawn;
    this.walk?.stop(); // a path playing marks the drawing it began on: it stops, and is played again on this one
    swapSvg(svg, drawn, this.drawing(), this.o.switches?.state.plan, this.o);
    this.details.pictures(svg); // the pictures went with the drawing: each box drawn now gets its own, by its key (§18)
    if (this.o.motion) markFlow(svg, this.o.motion.flow); // the links its style moves, on both lines of a trunk (§7)
    this.flowLegend();
    if (this.o.view) markView(svg, this.o.view);
    if (this.o.proposal) markProposal(svg, this.o.proposal.shown.marks);
    this.taps.reset(drawn.svg);
    this.zoom.resize(this.zoomSize(), { width: drawn.width, height: drawn.height });
    this.sel.redrawn();
    this.details.reselect();
    if (on) svg.querySelector<SVGElement>(`#${on}`)?.focus({ preventScroll: true });
    this.apply(this.zoom.view());
  }

  /** The legend of the moving links drawn now: a link folded into a stub or a box is not drawn, so not said (§7, §25). */
  private flowLegend(): void {
    this.legendSlot.empty();
    renderFlowLegend(this.legendSlot, this.o.motion?.flow ?? [], this.o.switches?.state.plan?.folded);
  }

  private apply(v: View): void {
    this.svg?.setAttribute('width', String(v.width));
    this.svg?.setAttribute('height', String(v.height));
    // labels by zoom: link labels hidden while too small to read, but on a link in focus or highlighted (§25)
    this.svg?.toggleClass('graph-note-labels-hidden', !!this.switching?.labelsHidden(v.scale));
    this.table?.setCssProps({ '--graph-note-scale': String(v.scale) });
    this.viewport.setCssProps({
      '--graph-note-x': `${v.x}px`,
      '--graph-note-y': `${v.y}px`,
      '--graph-note-height': `${this.viewportSize().height}px`,
      '--graph-note-touch': this.zoom.touchAction(),
    });
    this.viewport.toggleClass('is-zoomed', this.zoom.zoomedIn());
    this.sel.viewChanged(); // the arrow to a selection out of view follows (§25)
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

  private openFullscreen(): void {
    if (this.fullscreen) return;
    const overlay = activeDocument.body.createDiv({
      cls: 'graph-note-fullscreen',
      attr: { role: 'dialog', 'aria-modal': 'true', 'aria-label': `Graph ${this.o.graph}, full screen` },
    });
    const view = new GraphView(overlay.createDiv({ cls: 'graph-note' }), {
      ...this.o,
      drawn: this.drawn, // as laid out now, with the View menu's switches as they stand (§25)
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
    this.switching?.sync(); // a switch turned in full screen holds here too (§25)
  }
}
