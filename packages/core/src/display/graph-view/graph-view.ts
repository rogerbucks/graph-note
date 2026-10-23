// A drawn graph (spec §3). The bar holds the problems badge, Fit, zoom out, zoom in, Full screen and Edit. The drawing
// zooms and pans by button, gesture and key, as the core's Zoom decides. It opens full screen, and a box's details when
// tapped or opened by keyboard. This ties together its folder's parts: bar, drawing, taps, details, where it is placed.
import { Lifecycle } from '../lifecycle';
import { inHost, isPhone, readInHostDirection, setIcon } from '../host';
import { AcrossZoom, Zoom, scrollsOneWay, word } from '@thoughtknot/core';
import type { Drawn, View } from '@thoughtknot/core';
import { SourceToggle } from './source-toggle';
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
import { renderBar } from './view-bar';
import { openSpaceView } from './space-view-panel';
import { describeDrawing, insertSvg, swapSvg } from './drawing-svg';
import { ViewSwitching } from './view-switches';
import { markFlow, renderFlowLegend } from './flow-marks';
import { Taps, boxIn } from './taps';
import type { Target } from './taps';
import { DetailsPanel } from './details-panel';
import { Selection } from './selection';
import { drawnApart, renderTypeStrip, TypePlace, typeLeftAt } from './type-strip';
import { bindViewportEvents } from './viewport-events';
import { FullScreen } from './full-screen';
import { Aids } from './viewer-aids';
import { viewportSize, zoomSize } from './viewport-size';
import type { Measured } from './viewport-size';
import type { ViewOptions } from './view-options';

/** A drawn graph with its bar, zoom, full screen, details and, in edit mode, the inspector. */
export class GraphView extends Lifecycle {
  readonly containerEl: HTMLElement; // the element the card is drawn in
  readonly o: ViewOptions; // what the card was given, behind the read-only gate; the plugin's tests reach it by this
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
  private readonly fullscreen: FullScreen;
  /** The selection and so the focus, the highlight, and untangling the drawing (§25). */
  private sel!: Selection;
  /** The mini-map, the quick-info tooltip and where the kept-open details go (§24). */
  private aids!: Aids;
  private editButton: HTMLButtonElement | null = null;
  private readonly taps: Taps;
  private readonly source: SourceToggle;
  private readonly readOnly: () => boolean;
  /** The drawing as laid out now: the one given, or the one a View menu switch laid out since (§25). */
  private drawn: Drawn;
  /** The View menu and what its switches do (§25); none for a graph drawn as a table. */
  private switching: ViewSwitching | null = null;
  private unloaded = false;
  /** Where the legend of moving links is (§7). */
  private legendSlot!: HTMLElement;
  private readonly place = new TypePlace(); // where the last card was left as its type changed (§15)

  constructor(containerEl: HTMLElement, options: ViewOptions) {
    super();
    this.containerEl = inHost(containerEl);
    // whether the card is where the note is only read: in reading view, or opened from a card that is (spec §3)
    this.readOnly = () => !!options.readOnly?.() || (options.mode === 'note' && readOnlyHere(containerEl));
    // every write goes through that one check, as do the card's parts: none is offered where the card is read-only
    this.o = gateWrites({ ...options, readOnly: this.readOnly }, this.readOnly);
    this.taps = new Taps(options.drawn.svg);
    this.drawn = options.drawn;
    this.source = new SourceToggle(containerEl, {
      viewport: () => this.viewport,
      details: () => this.detailsEl,
      source: () => this.o.source ?? '',
      keptOpen: () => !!this.o.aids?.detailsOpen,
    });
    this.fullscreen = new FullScreen({
      graph: options.graph,
      card: this,
      draw: (el, close) =>
        new GraphView(el, {
          ...this.place.forFull(this.o), // drawn again as a new type, it takes up where it was (§15)
          drawn: this.drawn, // as laid out now, with the View menu's switches as they stand (§25)
          mode: 'full',
          onClose: close,
          readOnly: this.readOnly, // full screen opened in reading view is read-only too
        }),
      closed: () => {
        this.viewport.focus();
        this.switching?.sync(); // a switch turned in full screen holds here too (§25)
      },
    });
  }

  override onload(): void {
    const { problems, mode } = this.o,
      root = this.containerEl;
    readInHostDirection(root).addClass('thoughtknot-view', `is-${mode}`);

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
      fullScreen: () => this.fullscreen.show(),
      space: () => void (this.svg && openSpaceView(root, this.svg, this.o.graph, () => this.viewport.focus())),
      editHere: () => (this.o.editing?.()?.session ? this.o.onDoneEditing?.() : this.o.onEditHere?.()),
      toggleSource: (b) => this.source.toggle(b),
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
      switching: () => this.switching,
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
    const tools = root.createDiv({ cls: 'thoughtknot-card-tools' }); // the card's tools, in one row under the bar
    this.walk = new Walk(root, this.o, () => this.svg ?? undefined, tools); // walked paths: Play, and Record while edited (§7)
    if (this.o.writeView) this.maker = new ViewMaker(tools, this.o); // a view made by tapping, while edited (§7)
    if (this.o.editing) this.adder = new AddThing(tools, this.o); // a thing added from its text, while edited (§5)
    const view = this.o.view;
    const writes: HTMLElement[] = view
      ? renderViewStrip(root, view, () => this.sel.shownNow(this.zoom.view(), this.details.selectedKey()))
      : [];
    // a proposal laid over the graph (§17): who proposed it and the changes to accept or reject, which reading view takes away
    if (this.o.proposal) writes.push(...renderProposalStrip(root, this.o.proposal));
    const at = () => typeLeftAt(this.zoom.view(), this.details.selectedKey(), mode === 'full'); // kept as types change
    if (this.o.diagram) writes.push(...renderTypeStrip(root, this.o.diagram, this.readOnly, at)); // its types (§15)
    // what its drawn moving links mean, by their icons (§7); filled again as the View menu lays it out again (§25)
    this.legendSlot = root.createDiv({ cls: 'thoughtknot-flow-legend-slot' });
    this.flowLegend();
    this.viewport = root.createDiv({
      cls: 'thoughtknot-viewport',
      attr: {
        tabindex: '0',
        role: 'group',
        'aria-label': word('drawing.of', { graph: this.o.graph, count: this.o.drawn.width ? this.boxes().length : 0 }),
      },
    });
    // a graph drawn as a table is the plugin's own table; by a plug-in's type, its picture; else Graphviz's SVG (§15)
    this.table = drawnApart(this.viewport, this.o.diagram);
    if (!this.table)
      this.svg = insertSvg(this.viewport, this.o.drawn, this.drawing(), this.o.switches?.state.plan, this.o);
    // the mini-map, the quick-info tooltip and where the kept-open details go (§24)
    this.aids = new Aids(this, {
      o: this.o,
      root,
      viewport: this.viewport,
      svg: () => this.svg,
      zoom: () => this.zoom,
      size: () => this.zoomSize(),
      drawn: () => this.drawn,
      taps: this.taps,
      byKeyboard: () => this.sel.byKeyboard(),
    });
    if (this.svg && this.o.motion) markFlow(this.svg, this.o.motion.flow); // the links its style moves (§7)
    if (view && this.svg) markView(this.svg, view); // a view: what is outside it faded, its looks drawn (§7)
    if (view?.shown?.legend?.length) this.sel.refresh(); // and its legend's choices, as it was saved as shown (§25)
    if (this.o.proposal && this.svg) markProposal(this.svg, this.o.proposal.shown.marks); // a proposal: what it adds, changes, removes (§17)
    // the drawing as sentences, for screen readers (spec §11)
    const d = this.drawing();
    if (d) describeDrawing(root, this.viewport, d);
    this.detailsEl = root.createDiv({ cls: 'thoughtknot-details', attr: { role: 'region', 'aria-live': 'polite' } });
    this.detailsEl.hidden = true;
    const sw = this.switching;
    this.details = new DetailsPanel(this.detailsEl, this.svg ?? this.table ?? this.viewport, this.viewport, this.o, {
      ...this.sel.actions(),
      // a busy hub's details open or fold its links (§25)
      ...(sw ? { hub: (k: string) => sw.hub(k), toggleHub: (k: string) => sw.toggleHub(k) } : {}),
    });
    if (this.svg) this.details.pictures(this.svg); // the pictures its style draws on boxes (§18)
    this.aids.openDetails(this.details); // kept open, if the setting says (§24)
    // closing the details, by button, Escape or a tap on empty space, clears the selection and the focus with them (§25)
    this.details.onClosed = () => this.sel.closed();
    this.details.view = () => this.zoom.view(); // where a link that takes the card's tab leaves it (§18)
    const slot = mode === 'note' ? root.createDiv({ cls: 'thoughtknot-edit-slot' }) : null;

    // on a phone, a wide tree, flow or timeline is fitted to its height and scrolled across only (wide_types_phone)
    const room = Math.min(this.viewport.clientWidth || Infinity, activeWindow.innerWidth || Infinity);
    const type = this.o.diagram?.choice.drawn ?? 'network';
    this.across = mode === 'note' && scrollsOneWay(type, isPhone(), this.o.drawn.width, room);
    const size = { width: this.o.drawn.width, height: this.o.drawn.height, fromRight: !!this.o.drawn.mirrored };
    this.zoom = this.across ? new AcrossZoom(size, this.zoomSize(), mode) : new Zoom(size, this.zoomSize(), mode);
    this.zoom.onChange = (v) => this.apply(v);
    this.zoom.onExit = () => this.o.onClose?.();
    // a card drawn again as a new type, as the last was left (§15); a view saved as shown (§7); a link's back step (§18)
    const was = this.place.take(this.o.diagram, mode) ?? view?.shown ?? this.o.links?.cameBack();
    if (was?.zoom !== undefined) this.zoom.restore(was.zoom, was.x ?? 0, was.y ?? 0);
    this.apply(this.zoom.view());
    const { viewport, zoom, sel, details, taps, svg, o, fullscreen: full } = this,
      { info } = this.aids;
    const open = (t: Target, x?: boolean) => this.open(t, x),
      unfold = (fold: string, byKey?: boolean) =>
        this.switching?.unfold(fold, byKey ? (key) => boxIn(this.svg, key)?.focus({ preventScroll: true }) : undefined);
    bindViewportEvents({ card: this, root, viewport, zoom, sel, details, taps, info, svg, open, unfold, o, full });
    const observer = new ResizeObserver(() => {
      this.zoom.resize(this.zoomSize());
      this.aids.placeDetails();
    });
    observer.observe(this.viewport);
    if (this.o.aids?.detailsOpen) observer.observe(root); // the card’s own width decides where the details go (§24)
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
        } else {
          source?.remove();
          if (slot) this.o.onReady?.(slot);
        }
        // the editor's selection; else the one saved as shown, left, or kept as the type changed (reading view too)
        const reopen = this.o.editing?.()?.selected ?? (was?.selected ? { key: was.selected } : null);
        if (reopen) this.open(reopen);
        this.place.takeUp(this.svg, this.taps, this.zoom, () => this.fullscreen.show());
      },
      () => !gone,
    );
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
    b.setAttribute('aria-label', word(on ? 'bar.done-editing' : 'bar.edit-here'));
  }

  override onunload(): void {
    this.unloaded = true;
    // a move under way ends with the card, and the sheet's watchers with it; a card unloaded before it was built has none
    (this.sel as Selection | undefined)?.stop();
    (this.aids as Aids | undefined)?.unload(); // its tooltip is on the page itself, so it goes with the card
    (this.details as DetailsPanel | undefined)?.unload();
    this.walk?.stop(); // a path playing on its own stops with its card: no step waits on the clock
    this.fullscreen.unload();
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

  /**
   * The viewport's size as read once while a view is applied, or none. Reading an element's size makes the browser lay
   * the page out again whenever something changed since. A drag applies a view many times a second. So it reads the
   * size once, before it changes anything. The mini-map and the selection's arrow use that (pan_measured_once).
   */
  private measured: Measured | null = null;

  /** The viewport, or its size as read for the view being applied. */
  private box(): Measured {
    return this.measured ?? this.viewport;
  }

  /** The viewport's size to draw it at (viewport-size.ts), kept as tall while regrouped. */
  private viewportSize() {
    return this.sel.held(viewportSize(this.box(), this.drawn, this.o.mode, this.across, this.o.aids?.tallest));
  }

  /** The viewport's size to tell the zoom: none while hidden or not yet laid out, so the zoom keeps its view (§25). */
  private zoomSize() {
    return this.sel.held(zoomSize(this.box(), this.drawn, this.o.mode, this.across, this.o.aids?.tallest));
  }

  /**
   * The graph laid out again, as a View menu switch, a stub or a box asks (§25). It goes in the same SVG element,
   * marked as a view or a proposal marks it, and sized and tapped afresh. The selection, its focus and its details are
   * kept. The keyboard goes back on the box or link it was on (view_switch_view_only).
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
    this.aids.redrawn(drawn);
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
    // measured first, before anything changes the page, so the browser need not lay it out again to answer
    const { clientWidth, clientHeight } = this.viewport;
    this.measured = { clientWidth, clientHeight };
    try {
      this.applyMeasured(v);
    } finally {
      this.measured = null;
    }
  }

  /** The view applied, with the viewport's size as measured just before. */
  private applyMeasured(v: View): void {
    this.svg?.setAttribute('width', String(v.width));
    this.svg?.setAttribute('height', String(v.height));
    // labels by zoom: link labels hidden while too small to read, but on a link in focus or highlighted (§25)
    this.svg?.toggleClass('thoughtknot-labels-hidden', !!this.switching?.labelsHidden(v.scale));
    this.table?.setCssProps({ '--thoughtknot-scale': String(v.scale) });
    this.viewport.setCssProps({
      '--thoughtknot-x': `${v.x}px`,
      '--thoughtknot-y': `${v.y}px`,
      '--thoughtknot-height': `${this.viewportSize().height}px`,
      '--thoughtknot-touch': this.zoom.touchAction(),
    });
    this.viewport.toggleClass('is-zoomed', this.zoom.zoomedIn());
    this.aids.viewChanged(v);
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
}
