// What is selected in a card and how it shows (editor spec §25, slice 3): the selection is the focus — the thing or link
// chosen, its links and what is at their other ends stay at full strength — joined with the highlight under the pointer or
// the keyboard focus, the untangling (filter, legend, path, search) and the arrow keys that walk the links. It marks the
// drawing by class only, so nothing moves, and it never reaches the note.
import { FocusState, estimateEdge, nextAlong } from '@graph-note/core';
import type { FocusTarget, GraphDrawing, Kept, Layers, Zoom } from '@graph-note/core';
import type { DetailsPanel } from './details-panel';
import { DrawingMarks, focusTargetOf, sameTarget } from './focus-marks';
import { Highlight } from './hover';
import type { Taps, Target } from './taps';
import { UntangleView } from './untangle';
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
}

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

  /** Builds the untangling's parts at the end of what `root` holds so far, and the highlight of its links. */
  constructor(root: HTMLElement, o: ViewOptions, host: SelectionHost) {
    this.o = o;
    this.host = host;
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

  /** What a card's details offer of a thing, to untangle the drawing. */
  actions(): { showOnly: (key: string) => void; routeFrom: (key: string) => void } {
    return { showOnly: (k) => this.untangle.showOnly(k), routeFrom: (k) => this.untangle.routeFrom(k) };
  }

  /** The details were closed, however: the selection and the focus clear with them. */
  closed(): void {
    this.focus.clear();
    this.hover.tapped(null);
    this.refresh();
  }

  /** A box or link was opened: it is the selection, and so the focus. */
  select(t: Target): void {
    const d = this.host.drawing();
    this.focus.select(
      'key' in t ? { thing: t.key } : { edge: 'link' in t ? t.link : d ? estimateEdge(d, t.estimate) : -1 },
    );
    this.refresh();
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

  /** A finger or the pointer went down: the focus that follows is not the keyboard's. */
  pressed(): void {
    this.byPointer = true;
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
    this.host.open({ key }, walking);
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
