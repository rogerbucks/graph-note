// What is selected in a card and how it shows (editor spec §25, slice 3): the selection is the focus — the thing or link
// chosen, its links and what is at their other ends stay at full strength — joined with the highlight under the pointer or
// the keyboard focus, the untangling (filter, legend, path, search) and the arrow keys that walk the links. It marks the
// drawing by class only, so nothing moves, and it never reaches the note. What is chosen from the details is brought into
// view, readable, by a brief move (details_choose_moves, details_move_motion); the selection is kept clear of the details
// sheet (sheet_keeps_thing_clear), and pointed to by an arrow at the edge when it is out of view (selection_pointer).
import { FocusState, READABLE_SCALE, coverOf, estimateEdge, nextAlong, pointerTo } from '@graph-note/core';
import type { Bounds, FocusTarget, GraphDrawing, Kept, Layers, Size, TrailStep, Zoom } from '@graph-note/core';
import type { DetailsPanel } from './details-panel';
import { Glide, stepName } from './details-nav';
import type { NavActions } from './details-nav';
import { DrawingMarks, focusTargetOf, sameTarget } from './focus-marks';
import { Highlight } from './hover';
import { scrollNote } from './placement';
import { SelectionPointer } from './selection-pointer';
import type { Taps, Target } from './taps';
import { UntangleView } from './untangle';
import type { ThingActions } from './untangle';
import type { ViewOptions } from './view-options';

/** What the selection needs of its card, given late because the card builds them after it. */
export interface SelectionHost {
  svg: () => SVGSVGElement;
  zoom: () => Zoom;
  details: () => DetailsPanel;
  /** Opens a box or link as a tap does; `walking` when an arrow key does, which never answers a question for a second thing. */
  open: (t: Target, walking?: boolean) => void;
  taps: Taps;
  drawing: () => GraphDrawing | undefined;
  /** The drawing's viewport, and its size as the zoom has it. */
  viewport: () => HTMLElement;
  size: () => Size;
}

/**
 * How the selection came, which decides how it is brought into view: a tap, moved only to keep it clear of the sheet;
 * chosen from the details, brought into view readable; pointed to by the arrow, brought into view as it is; found or
 * walked to, brought into view at once, as finding always has.
 */
type How = 'tap' | 'chosen' | 'shown' | 'found';

/** The selection of one card: its focus, its untangling and its highlight. */
export class Selection {
  /** Finding, filtering, the legend and the path, which sit in the card under its bar. */
  readonly untangle: UntangleView;
  private readonly focus = new FocusState();
  private readonly hover: Highlight;
  private readonly o: ViewOptions;
  private readonly host: SelectionHost;
  private marks: DrawingMarks | null = null;
  /** What the focus and the untangling come to, worked out again only when either changes. */
  private layers: Layers;
  /** What is highlighted as drawn now, so a change of highlight marks only what it touched. */
  private shownHot: Kept | null = null;
  /** The middle of each thing by its key, found when the arrow keys first walk. */
  private places: Map<string, { x: number; y: number }> | null = null;
  /** Whether the focus last came by a pointer, so a click's focus is not a keyboard's highlight. */
  private byPointer = false;
  /** What is selected, and where it is in the drawing, as fractions of it. */
  private target: Target | null = null;
  private box: Bounds | null = null;
  /** How the selection came (`How`). */
  private how: How = 'tap';
  /** The pixels at the viewport's foot the details sheet covers, as last kept clear. */
  private kept = 0;
  private glide: Glide | null = null;
  private readonly arrow: SelectionPointer;

  /** Builds the untangling's parts at the end of what `root` holds so far, and the highlight of its links. */
  constructor(root: HTMLElement, o: ViewOptions, host: SelectionHost) {
    this.o = o;
    this.host = host;
    this.arrow = new SelectionPointer(host.viewport, () => this.came('shown', () => this.inSight()));
    this.untangle = new UntangleView(root, {
      drawing: host.drawing() ?? { graph: o.graph, boxes: [], links: [], estimates: [] },
      reading: o.reading,
      graph: o.graph,
      depth: () => o.focusDepth ?? 1,
      changed: () => this.refresh(),
      go: (key) => this.goTo(key, false),
    });
    this.layers = this.untangle.layers(null);
    this.hover = new Highlight(this.untangle.edges, () => this.hotChanged());
  }

  /** What a card's details offer: to untangle the drawing from a thing, and to choose what its links reach (§25). */
  actions(): ThingActions & NavActions {
    return {
      showOnly: (k) => this.untangle.showOnly(k),
      routeFrom: (k) => this.untangle.routeFrom(k),
      choose: (step) => this.bring(step),
      sheetMoved: () => this.inSight(),
    };
  }

  /** The details were closed, however: the selection and the focus clear with them, and the sheet's strip with them. */
  closed(): void {
    this.focus.clear();
    this.hover.tapped(null);
    this.target = this.box = null;
    this.glide?.stop();
    this.kept = 0;
    this.host.zoom().keepClear(0);
    this.refresh();
    this.pointAt();
  }

  /** A box or link was opened: it is the selection, and so the focus; and it is brought into view as it came (`How`). */
  select(t: Target): void {
    const d = this.host.drawing();
    this.focus.select(
      'key' in t ? { thing: t.key } : { edge: 'link' in t ? t.link : d ? estimateEdge(d, t.estimate) : -1 },
    );
    this.target = t;
    this.box = this.boundsOf(t);
    this.refresh();
    this.inSight();
  }

  /** A thing or link chosen from the details: the selection, its details shown, brought into view readable (§25). */
  private bring(step: TrailStep): void {
    // one hidden by a filter or the legend would be chosen out of sight: the whole graph is shown first, as finding does;
    // a link is numbered among the drawing's links as its edge is
    const { hidden } = this.layers;
    if ('key' in step ? hidden.things.has(step.key) : hidden.edges.has(step.link)) this.untangle.reset();
    this.came('chosen', () => this.host.open(step, true));
  }

  /** Runs `then` with the selection coming as `how`, and back to a tap's after. */
  private came(how: How, then: () => void): void {
    this.how = how;
    try {
      then();
    } finally {
      this.how = 'tap';
    }
  }

  /**
   * Brings the selection into sight as it came (`How`), clear of the details sheet: the drawing pans up into the strip the
   * sheet covers, never more; where the sheet covers the whole drawing the note scrolls instead. A tap moves the view only
   * for the sheet; from the details the thing is also made readable; the move is brief, or at once (§25).
   */
  private inSight(): void {
    const box = this.box,
      zoom = this.host.zoom(),
      top = this.host.details().sheetTop();
    if (!box) return this.pointAt();
    const r = this.host.viewport().getBoundingClientRect(),
      cover = top === null ? 0 : coverOf(r, top);
    this.kept = cover < r.height ? cover : 0;
    zoom.keepClear(this.kept);
    const to = this.how === 'tap' && !this.kept ? null : zoom.aim(box, this.how === 'chosen' ? READABLE_SCALE : 0);
    if (to && this.how === 'found') zoom.restore(to.scale, to.x, to.y);
    else if (to) (this.glide ??= new Glide(this.host.viewport())).to(zoom, to);
    if (top !== null && this.kept === 0 && cover > 0) {
      const v = zoom.view(),
        scale = to?.scale ?? v.scale,
        foot = r.top + (to?.y ?? v.y) + (box.y + box.height) * (v.height / v.scale) * scale;
      if (foot > top) scrollNote(this.host.viewport(), foot - top + 8);
    }
    this.pointAt();
  }

  /** The view moved: the arrow to the selection follows, or goes. */
  viewChanged(): void {
    this.pointAt();
  }

  /** Stops a move under way, as a finger or the pointer takes over, or the card goes. */
  stop(): void {
    this.glide?.stop();
  }

  /** Shows the arrow at the edge pointing to the selection when it is out of view, or hides it (selection_pointer). */
  private pointAt(): void {
    const t = this.target,
      at = t && this.box ? pointerTo(this.box, this.host.zoom().view(), this.host.size(), this.kept) : null;
    const name = !t ? '' : 'estimate' in t ? 'the estimated link' : stepName(this.o.reading, this.o.graph, t);
    this.arrow.show(at, name);
  }

  /** Where a box or link is in the drawing, as fractions of it. */
  private boundsOf(t: Target): Bounds | null {
    const [attr, value] =
      'key' in t
        ? ['data-key', t.key]
        : 'link' in t
          ? ['data-link', String(t.link)]
          : ['data-estimate', `${t.estimate}`];
    const g = Array.from(this.host.svg().querySelectorAll('g.node, g.edge')).find(
        (n) => n.getAttribute(attr) === value,
      ),
      id = g?.getAttribute('id');
    return id ? this.host.taps.bounds(id) : null;
  }

  /** A tap by touch selected what it did: there is no hover on touch, so the tap gives the highlight. */
  touched(touch: boolean): void {
    this.hover.tapped(touch ? this.focus.target : null);
  }

  /** Whether a thing chosen answers the question of a path: asked for, or by Shift with another selected. */
  second(key: string, extend: boolean): boolean {
    if (this.untangle.pick(key)) return true;
    const selected: FocusTarget | null = this.focus.target;
    if (!extend || !selected || !('thing' in selected) || selected.thing === key) return false;
    this.untangle.routeBetween(selected.thing, key);
    return true;
  }

  /** The focus or the untangling changed: works the layers out again and marks every box and link. */
  refresh(): void {
    const kept = this.focus.kept(this.untangle.edges, this.o.focusDepth ?? 1);
    this.layers = this.untangle.layers(kept);
    this.shownHot = this.hover.hot();
    this.drawn().all({ ...this.layers, hot: this.shownHot });
  }

  /** Only the highlight changed: marks just the boxes and links it was on and is on now, over the layers as they stand. */
  private hotChanged(): void {
    const was = this.shownHot,
      now = this.hover.hot();
    this.shownHot = now;
    const things = new Set([...(was?.things ?? []), ...(now?.things ?? [])]),
      links = new Set([...(was?.edges ?? []), ...(now?.edges ?? [])]);
    this.drawn().some({ ...this.layers, hot: now }, things, links);
  }

  private drawn(): DrawingMarks {
    this.marks ??= new DrawingMarks(this.host.svg());
    return this.marks;
  }

  /** A tap on empty space, or Escape: drops a question for a second thing, else clears the selection and the focus. */
  clear(): boolean {
    if (this.untangle.cancel()) return true;
    if (!this.focus.target) return false;
    this.host.details().close();
    return true;
  }

  /** A finger or the pointer went down: the focus that follows is not the keyboard's, and a move under way stops. */
  pressed(): void {
    this.byPointer = true;
    this.stop();
  }

  /** The pointer is over something, or has left it. */
  over(e: PointerEvent): void {
    if (e.pointerType !== 'touch') this.hover.over(focusTargetOf(e.target));
  }

  /** The pointer is leaving something; moving between the parts of one thing or link keeps the highlight. */
  out(e: PointerEvent): void {
    if (e.pointerType !== 'touch' && !sameTarget(focusTargetOf(e.relatedTarget), focusTargetOf(e.target)))
      this.hover.over(null);
  }

  /** Something took the focus: the keyboard's highlight, unless a click gave it. */
  focusIn(e: FocusEvent): void {
    this.hover.focus(this.byPointer ? null : focusTargetOf(e.target));
  }

  /** Something lost the focus; when it left the drawing, what comes back to it is the keyboard's, not a click's. */
  focusOut(e: FocusEvent): void {
    this.hover.focus(null);
    const viewport = this.host.svg().closest('.graph-note-viewport');
    if (!viewport?.contains(e.relatedTarget as Node | null)) this.byPointer = false;
  }

  /** A key was pressed: Escape clears the focus first, the arrows walk the links. True when used. */
  key(e: KeyboardEvent): boolean {
    this.byPointer = false;
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key === 'Escape') return this.clear();
    return e.key.startsWith('Arrow') && this.walk(e.key);
  }

  /**
   * Selects a thing as its details do, brings it into view and gives it the keyboard focus (finding, walking). A thing
   * found answers a question waiting for a second thing; one walked to does not, it only moves the selection.
   */
  private goTo(key: string, walking: boolean): void {
    const svg = this.host.svg();
    const g = Array.from(svg.querySelectorAll<SVGGElement>('g.node')).find((n) => n.getAttribute('data-key') === key);
    // brought into view at once, clear of the details sheet, as it is selected; and so even when it answers a question
    // for a second thing, or is a step recorded, rather than the selection
    this.came('found', () => this.host.open({ key }, walking));
    const box = g ? this.host.taps.bounds(g.getAttribute('id') ?? '') : null;
    if (box) this.host.zoom().reveal(box);
    g?.focus({ preventScroll: true });
  }

  /** Walks the selection along a link to the next thing in the direction of an arrow key; false when it cannot. */
  private walk(arrow: string): boolean {
    const selected = this.focus.target;
    if (!selected || !('thing' in selected)) return false;
    const svg = this.host.svg();
    this.places ??= this.host.taps.places((id) => svg.querySelector(`#${id}`)?.getAttribute('data-key') ?? null);
    const { hidden } = this.layers;
    const shown = this.untangle.edges.filter((_e, i) => !hidden.edges.has(i));
    const next = nextAlong(shown, this.places, selected.thing, arrow);
    if (!next) return false;
    this.goTo(next, true);
    return true;
  }
}
