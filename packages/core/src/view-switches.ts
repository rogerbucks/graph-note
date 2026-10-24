// The View menu's switches (editor spec §25, slice 3). They are four ways of untangling that change the drawing before
// anyone asks: labels by zoom, busy hubs folded, groups folded and parallel links merged. Each is on or off from a
// graph's View menu (view_switches). They start from the plugin's settings (view_switch_defaults), the style graph's
// merging, and a view's switches saved as shown. A card's state of them is the drawing's alone. It changes how the
// graph is drawn, never the note. It is saved with the graph only when the user saves the view
// (view_switch_view_only).
import { READABLE_PX } from './details-nav.ts';
import { edgesOf } from './focus.ts';
import type { FocusEdge, Kept } from './focus.ts';
import { STYLE } from './layout.ts';
import type { GraphDrawing } from './note-reading.ts';
import type { Settings } from './settings.ts';
import { linksOf } from './style.ts';
import type { OnOff, StyleGraph } from './style-graph.ts';
import { drawnGroups, foldPlan } from './untangle-fold.ts';
import type { Folding } from './untangle-fold.ts';
import { word } from './words.ts';
import type { WordKey } from './words.ts';

/** The four switches, in the order the View menu lists them. */
export const VIEW_SWITCHES = ['labels', 'hubs', 'groups', 'merge'] as const;
/** One of the four switches. */
export type ViewSwitch = (typeof VIEW_SWITCHES)[number];
/** Each switch, on or off. */
export type ViewSwitches = Record<ViewSwitch, boolean>;

/** The word each switch is named by: its setting's name, which the settings page says too. */
const SWITCH_WORDS = {
  labels: 'settings.labels-by-zoom.name',
  hubs: 'settings.fold-hubs.name',
  groups: 'settings.fold-groups.name',
  merge: 'settings.merge-links.name',
} as const satisfies Record<ViewSwitch, WordKey>;

/** Each switch as the View menu names it, in the reader's language. */
export const switchName = (s: ViewSwitch): string => word(SWITCH_WORDS[s]);

/** The setting that holds each switch's default (view_switch_defaults). */
export const SWITCH_SETTINGS = {
  labels: 'labelsByZoom',
  hubs: 'foldHubs',
  groups: 'foldGroups',
  merge: 'mergeLinks',
} as const satisfies Record<ViewSwitch, keyof Settings>;

/**
 * The switches a graph, or `view`, starts with. Each is as the settings hold it. Links are merged as the style graph's
 * Links merges them, where it says. For a view saved as shown with its switches, each is as it was saved.
 */
export function startingSwitches(
  settings: Pick<Settings, (typeof SWITCH_SETTINGS)[ViewSwitch]>,
  style?: Pick<StyleGraph, 'links' | 'shown'>,
  view?: string,
): ViewSwitches {
  const saved = view === undefined ? undefined : style?.shown.get(view);
  const written = style?.links.some((l) => l.merge !== undefined && (l.view === undefined || l.view === view));
  const start = Object.fromEntries(
    VIEW_SWITCHES.map((s) => [s, settings[SWITCH_SETTINGS[s]] === 'on']),
  ) as ViewSwitches;
  if (style && written) start.merge = linksOf(style, view).merge;
  for (const s of VIEW_SWITCHES) if (saved?.[s] !== undefined) start[s] = saved[s] === 'on';
  return start;
}

/** The scale below which a link's label is drawn under `READABLE_PX` pixels, too small to read (untangle_labels). */
export const LABEL_SCALE = READABLE_PX / ((STYLE.edge_font_size * 4) / 3);

/**
 * Whether the drawing's link labels are hidden at `scale` (untangle_labels). Only with labels by zoom on, and only
 * while the drawing is shown too small to read them. A host still shows the label of each link in focus or highlighted.
 */
export function labelsHidden(switches: Pick<ViewSwitches, 'labels'>, scale: number): boolean {
  return switches.labels && scale < LABEL_SCALE;
}

/** A fold to open or close again: a busy hub's, by its key, or a group's, by its label. */
export type Fold = { hub: string } | { group: string };

/**
 * A plan that lays out only the things and links `only` keeps, so they are drawn together (untangle_regroup). The rest
 * is left out of the layout. No hub is folded: the few left need no stub. A group keeps its box while any of its things
 * is kept, and a folded one still holds its own links.
 */
function regrouped(
  plan: Folding | undefined,
  keys: readonly string[],
  edges: readonly FocusEdge[],
  only: Kept,
): Folding {
  const groups = (plan?.groups ?? []).filter(([, things]) => things.some((k) => only.things.has(k))),
    box = new Map<string, string>();
  for (const [label, things, isFolded] of groups) if (isFolded) for (const k of things) box.set(k, label);
  const inBox = (e: FocusEdge) => box.has(e.from) && box.get(e.from) === box.get(e.to);
  return {
    hidden: keys.filter((k) => !only.things.has(k)),
    folded: edges.flatMap((e, i) => (!only.edges.has(i) || inBox(e) ? [i] : [])),
    hubs: [],
    groups,
    merge: plan?.merge ?? false,
  };
}

/**
 * One card's switches, and the hubs and groups opened since they were folded. They are the drawing's alone, never
 * written to the note. It folds a styled drawing for its layout (`folded`). It keeps the plan it last made, for what a
 * tap on a stub or a box opens.
 */
export class ViewState {
  readonly switches: ViewSwitches;
  /** The plan the drawing was last folded by, if it was folded. */
  plan: Folding | undefined;
  private readonly openedHubs = new Set<string>();
  /** The hubs the user folded one by one, with busy hubs not folded as a whole: all start open (Roger, 24 Oct 2026). */
  private readonly foldedHubs = new Set<string>();
  private readonly openedGroups = new Set<string>();
  /** What each card is regrouped to, by the card: laid out alone, the rest left out (untangle_regroup). */
  private readonly only = new WeakMap<object, Kept>();

  /** For a card starting with these switches. */
  constructor(start: ViewSwitches) {
    this.switches = { ...start };
  }

  /**
   * Turns a switch on or off. True when the drawing must be laid out again, as for every switch but labels by zoom. The
   * host shows or hides those in place. Turning hubs or groups folded on folds again each one opened.
   */
  turn(s: ViewSwitch, on: boolean): boolean {
    if (this.switches[s] === on) return false;
    this.switches[s] = on;
    if (s === 'hubs') {
      this.openedHubs.clear();
      this.foldedHubs.clear();
    }
    if (on && s === 'groups') this.openedGroups.clear();
    return s !== 'labels';
  }

  /** Opens a hub's or a group's fold: its links, or its things, drawn again. */
  open(fold: Fold): void {
    if ('hub' in fold) {
      this.openedHubs.add(fold.hub);
      this.foldedHubs.delete(fold.hub);
    } else this.openedGroups.add(fold.group);
  }

  /** Folds a hub or a group opened before. */
  fold(fold: Fold): void {
    if ('hub' in fold) {
      this.openedHubs.delete(fold.hub);
      if (!this.switches.hubs) this.foldedHubs.add(fold.hub);
    } else this.openedGroups.delete(fold.group);
  }

  /**
   * Regroups one card's drawing to a thing and its neighbours (`only`), or draws the whole graph again (null). It is that
   * card's alone: another card of the same graph, such as its full screen, is drawn as before (untangle_regroup).
   */
  keepOnly(card: object, only: Kept | null): void {
    if (only) this.only.set(card, only);
    else this.only.delete(card);
  }

  /**
   * The drawing (as its style draws it: `styledDrawing`) folded and merged as the switches say, for its layout. It is
   * the same drawing with the plan on it, or with none when nothing folds. For a card regrouped (`keepOnly`), only what
   * it keeps is laid out. The drawing given is never changed.
   */
  folded(d: GraphDrawing, card?: object): GraphDrawing {
    const keys = d.boxes.map((b) => b.key),
      edges = edgesOf(d);
    const groups = drawnGroups(d.nudges ?? [], keys, d.diagram);
    this.plan = foldPlan(keys, edges, groups, {
      hubs: this.switches.hubs || this.foldedHubs.size > 0,
      groups: this.switches.groups,
      merge: this.switches.merge,
      opened: { hubs: this.openHubs(keys, edges, groups), groups: [...this.openedGroups] },
    });
    const only = card ? this.only.get(card) : undefined;
    const plan = only ? regrouped(this.plan, keys, edges, only) : this.plan;
    const { folding: _was, ...rest } = d;
    return plan ? { ...rest, folding: plan } : rest;
  }

  /**
   * A busy hub's stub as its details offer it. It says how many links the stub holds folded (those not already in
   * another stub or a box), and whether it is folded now. Null for a thing that is no busy hub, or with busy hubs not
   * folded. Null too for a hub drawn inside a folded group's box.
   */
  hub(d: GraphDrawing, key: string): { links: number; folded: boolean } | null {
    const keys = d.boxes.map((b) => b.key),
      edges = edgesOf(d),
      groups = drawnGroups(d.nudges ?? [], keys, d.diagram);
    const opened = this.openHubs(keys, edges, groups).filter((k) => k !== key);
    const plan = foldPlan(keys, edges, groups, {
      ...this.switches,
      hubs: true,
      opened: { hubs: opened, groups: [...this.openedGroups] },
    });
    const stub = plan?.hubs.find(([k]) => k === key);
    const folded = this.switches.hubs ? !this.openedHubs.has(key) : this.foldedHubs.has(key);
    return stub ? { links: stub[1], folded } : null;
  }

  /**
   * The busy hubs drawn open. With busy hubs folded as a whole, those opened since. Without, every one but those the
   * user folded one by one.
   */
  private openHubs(keys: readonly string[], edges: readonly FocusEdge[], groups: ReturnType<typeof drawnGroups>) {
    if (this.switches.hubs) return [...this.openedHubs];
    const every = foldPlan(keys, edges, groups, {
      hubs: true,
      groups: false,
      merge: false,
      opened: { hubs: [], groups: [] },
    });
    return (every?.hubs ?? []).map(([k]) => k).filter((k) => !this.foldedHubs.has(k));
  }

  /** The switches as a view saved as shown writes them (§7). */
  saved(): Record<ViewSwitch, OnOff> {
    return Object.fromEntries(VIEW_SWITCHES.map((s) => [s, this.switches[s] ? 'on' : 'off'])) as Record<
      ViewSwitch,
      OnOff
    >;
  }
}
