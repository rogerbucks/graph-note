// The View menu's switches (editor spec §25, slice 3). They are four ways of untangling that change the drawing before
// anyone asks: labels by zoom, busy hubs folded, groups folded and parallel links merged. Each is on or off from a
// graph's View menu (view_switches). They start from the plugin's settings (view_switch_defaults), the style graph's
// merging, and a view's switches saved as shown. A card's state of them is the drawing's alone. It changes how the
// graph is drawn, never the note. It is saved with the graph only when the user saves the view
// (view_switch_view_only).
import { READABLE_PX } from './details-nav.ts';
import { edgesOf } from './focus.ts';
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
 * One card's switches, and the hubs and groups opened since they were folded. They are the drawing's alone, never
 * written to the note. It folds a styled drawing for its layout (`folded`). It keeps the plan it last made, for what a
 * tap on a stub or a box opens.
 */
export class ViewState {
  readonly switches: ViewSwitches;
  /** The plan the drawing was last folded by, if it was folded. */
  plan: Folding | undefined;
  private readonly openedHubs = new Set<string>();
  private readonly openedGroups = new Set<string>();

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
    if (on && s === 'hubs') this.openedHubs.clear();
    if (on && s === 'groups') this.openedGroups.clear();
    return s !== 'labels';
  }

  /** Opens a hub's or a group's fold: its links, or its things, drawn again. */
  open(fold: Fold): void {
    if ('hub' in fold) this.openedHubs.add(fold.hub);
    else this.openedGroups.add(fold.group);
  }

  /** Folds a hub or a group opened before. */
  fold(fold: Fold): void {
    if ('hub' in fold) this.openedHubs.delete(fold.hub);
    else this.openedGroups.delete(fold.group);
  }

  /**
   * The drawing (as its style draws it: `styledDrawing`) folded and merged as the switches say, for its layout. It is
   * the same drawing with the plan on it, or with none when nothing folds. The drawing given is never changed.
   */
  folded(d: GraphDrawing): GraphDrawing {
    const keys = d.boxes.map((b) => b.key);
    this.plan = foldPlan(keys, edgesOf(d), drawnGroups(d.nudges ?? [], keys, d.diagram), {
      hubs: this.switches.hubs,
      groups: this.switches.groups,
      merge: this.switches.merge,
      opened: { hubs: [...this.openedHubs], groups: [...this.openedGroups] },
    });
    const { folding: _was, ...rest } = d;
    return this.plan ? { ...rest, folding: this.plan } : rest;
  }

  /**
   * A busy hub's stub as its details offer it. It says how many links the stub holds folded (those not already in
   * another stub or a box), and whether it is folded now. Null for a thing that is no busy hub, or with busy hubs not
   * folded. Null too for a hub drawn inside a folded group's box.
   */
  hub(d: GraphDrawing, key: string): { links: number; folded: boolean } | null {
    if (!this.switches.hubs) return null;
    const keys = d.boxes.map((b) => b.key);
    const opened = [...this.openedHubs].filter((k) => k !== key);
    const plan = foldPlan(keys, edgesOf(d), drawnGroups(d.nudges ?? [], keys, d.diagram), {
      ...this.switches,
      opened: { hubs: opened, groups: [...this.openedGroups] },
    });
    const stub = plan?.hubs.find(([k]) => k === key);
    return stub ? { links: stub[1], folded: !this.openedHubs.has(key) } : null;
  }

  /** The switches as a view saved as shown writes them (§7). */
  saved(): Record<ViewSwitch, OnOff> {
    return Object.fromEntries(VIEW_SWITCHES.map((s) => [s, this.switches[s] ? 'on' : 'off'])) as Record<
      ViewSwitch,
      OnOff
    >;
  }
}
