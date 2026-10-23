// The drawing in the edit pane (spec §4): the graph as typed so far, drawn beside its text. Choosing a box or a link in
// it selects where it is written in the text. Its Edit puts the focus back in the text. In place, in a drawing's card,
// the editor has none: the card's own drawing is its drawing. It is laid out apart from the interface, as every drawing
// is (spec §9). A graph typed or pasted past a limit is not drawn, and a banner beside its text says why. A graph too
// large to lay out is shown as its overview under the banner, where the host gives its colours (§53, scale_massive_card).
// A block too large to read at once is read into a store in memory, a part at a time. It is shown as its overview
// from there, under the banner (§53, scale_in_parts).
import {
  depthOf,
  MeshIndex,
  memoryBackend,
  parked,
  readStyle,
  setInParts,
  startingSwitches,
  storedGraphs,
  ViewState,
  word,
} from '@thoughtknot/core';
import type {
  Drawn,
  FocusDepth,
  GraphDrawing,
  NoteReading,
  PaneSession,
  PropType,
  Refusal,
  Settings,
} from '@thoughtknot/core';
import type { FilterKeep } from '../../filter-saved.ts';
import type { Palette } from '../../palette.ts';
import { massiveView } from '../graph-view/massive-view';
import { massiveThing } from '../graph-view/massive-thing';
import { Lifecycle } from '../lifecycle';
import { refusalBanner } from '../refusal-banner';
import { GraphView } from '../graph-view/graph-view';
import type { Chosen, SwitchesShown } from '../graph-view/view-options';
import { aidsOf } from '../graph-view/viewer-aids';
import type { ViewerAids } from '../graph-view/viewer-aids';

/** What the pane's drawing asks of its host: the settings as they now are, and a graph laid out apart from the interface (§9). */
export interface PaneHost {
  settings: () => Settings;
  /** The drawing laid out, or why it is shown as text; null when it is no longer wanted. Rejects when the engine cannot start. */
  layout: (drawing: GraphDrawing, owner: object) => Promise<Drawn | Refusal | null>;
  /** The host's colours, for the overview of a graph too large to lay out. Not set: the banner alone. */
  palette?: Palette;
  /** Saves a filter chosen on the overview in the graph's style block (scale_filter_live). Not set: only tried. */
  saveFilter?: (graph: string, keep: FilterKeep) => void;
}

/** A drawing given the direction set on the settings page, unless its own style sets one (§6, §15, §21); else the best fit. */
export function directed(drawing: GraphDrawing, direction: Settings['direction']): GraphDrawing {
  const keep = direction === 'best' || !!drawing.direction || !!drawing.diagram;
  return keep ? drawing : { ...drawing, direction };
}

/** What choosing in the drawing does: Edit, a box or a link chosen, and the text replaced, as by an estimate's quick fix. */
interface Choosing {
  edit: () => void;
  select: (chosen: Chosen) => void;
  /** Says whether there was a field to replace the text in. */
  replace: (now: string) => boolean;
}

/**
 * An estimated link's quick fix in the pane (§3). The session's text becomes `now`, as the fix bar's fix makes it. That
 * happens only while it is still `was`, as drawn, and the editor is still there. Says why nothing was written, or null.
 */
function fixInPane(s: PaneSession, on: Choosing, was: string, now: string): string | null {
  if (s.text !== was) return word('pane.fix-not-as-drawn');
  return on.replace(now) ? null : word('pane.fix-closed');
}

/** Puts the session's graph, as laid out, into the pane's drawing; returns the view, or null when nothing is drawn. */
function drawInPane(
  host: HTMLElement,
  drawn: Drawn | Refusal | undefined,
  reading: NoteReading,
  s: PaneSession,
  on: Choosing,
  focusDepth: FocusDepth,
  switches: SwitchesShown,
  callouts: boolean,
  aids: ViewerAids,
) {
  host.empty();
  if (!drawn) {
    host.createEl('p', { cls: 'thoughtknot-quiet', text: word('pane.nothing-yet') });
    return null;
  }
  if ('reason' in drawn) {
    refusalBanner(host, drawn);
    return null;
  }
  const card = host.createDiv({ cls: 'thoughtknot' });
  return new GraphView(card, {
    reading,
    graph: s.graph,
    drawn,
    mode: 'pane',
    // how far focus reaches, as the settings say, and the View menu, here as in a card (§25)
    focusDepth,
    switches,
    callouts,
    aids,
    problems: reading.problems
      .filter((p) => p.graph === s.graph && reading.texts[p.block] === s.text)
      .map((p) => ({ ...p, noteLine: p.line })),
    lineOf: (at) => at.line,
    onEdit: on.edit,
    onSelect: on.select,
    // an estimated link's quick fix (§3), made in the pane's text, as its fix bar makes it
    writeBlock: (_block, was, now) => Promise.resolve(fixInPane(s, on, was, now)),
    // the pane's badge counts things parked for later apart from problems, as a card's does (§8)
    parked: parked(reading, s.graph, new Date().toISOString().slice(0, 10)),
  });
}

/** The pane's drawing, redrawn from what is typed, once it is laid out. */
export class PaneDrawing extends Lifecycle {
  private view: GraphView | null = null;
  private readonly host: PaneHost;
  /** The pane's View menu (§25): started from the settings, kept while the pane redraws what is typed. */
  private state: ViewState | null = null;
  /** The store a block too large to read at once is read into, made when first needed. */
  private store: MeshIndex | null = null;

  constructor(host: PaneHost) {
    super();
    this.host = host;
  }

  /** Shows `d`, too large to lay out, as its overview, starting with the filter saved in its style graph. */
  private overview(host: HTMLElement, d: GraphDrawing, reading: NoteReading): void {
    const { palette, saveFilter } = this.host;
    if (!palette || reading.tooLarge) return;
    const { style } = readStyle(reading.texts, d.graph, reading);
    massiveView(host, d, {
      graph: d.graph,
      palette,
      layout: (part, by) => this.host.layout(part, by),
      props: (key) => reading.world[d.graph]?.p(key) ?? {},
      chosen: style.filters.find((f) => f.view === undefined)?.keep,
      ...(saveFilter ? { chose: (keep: FilterKeep) => saveFilter(d.graph, keep) } : {}),
    });
  }

  /**
   * Shows the session's block, too large to read at once, as its overview under the banner. It is read into the store a
   * part at a time, with the page's own work done between parts. Nothing is shown for any other refusal.
   */
  private inParts(host: HTMLElement, s: PaneSession, why: Refusal, stale: () => boolean, on: Choosing): void {
    const { palette } = this.host;
    const over = 'limit' in why ? why.limit : undefined;
    if (!palette || (over !== 'text-bytes' && over !== 'text-lines')) return;
    const ix = (this.store ??= new MeshIndex(memoryBackend()));
    const pause = () => new Promise<void>((done) => host.win.setTimeout(done, 0));
    const was = s.text,
      text = `\`\`\`gql\n${was}\n\`\`\`\n`;
    // a change to a thing chosen: made on its lines in the block, then put in the pane's text, as a quick fix is
    const change = (key: string) => (prop: string, type: PropType, words: string) => {
      const edit = setInParts(ix, { note: 'pane', text, graph: s.graph }, key, prop, type, words);
      return Promise.resolve(
        edit.ok ? fixInPane(s, on, was, edit.text.split('\n').slice(1, -2).join('\n')) : edit.reason,
      );
    };
    void storedGraphs(ix, 'pane', text, pause).then((graphs) => {
      const stored = graphs.get(s.graph);
      if (!stored || stale()) return;
      const slot = host.createDiv();
      massiveView(slot, stored.drawing, {
        graph: s.graph,
        palette,
        layout: (part, by) => this.host.layout(part, by),
        props: stored.props,
        picked: (key) => massiveThing(slot, { key, props: stored.props(key), readOnly: false, change: change(key) }),
      });
    });
  }

  /** Takes the drawing away. */
  clear(): void {
    this.view?.unload();
    this.view = null;
  }

  /** Draws the session's graph, as read, into `host` — unless, by the time it is laid out, `stale` says it is not wanted. */
  redraw(host: HTMLElement, reading: NoteReading, s: PaneSession, stale: () => boolean, on: Choosing): void {
    const d = reading.graphs.get(s.graph);
    const state = (this.state ??= new ViewState(startingSwitches(this.host.settings())));
    const laidOut = (by: object) => (d ? this.host.layout(state.folded(d, by), by) : Promise.resolve(null));
    // too large to read, nothing was read (§9); and a layout this editor asked for before, not yet started, is dropped
    const laid = reading.tooLarge
      ? Promise.resolve(reading.tooLarge)
      : d && d.boxes.length
        ? laidOut(this)
        : Promise.resolve(undefined);
    void laid
      .then((drawn) => {
        if (stale() || drawn === null) return;
        this.clear();
        const depth = depthOf(this.host.settings().focusDepth);
        const view = drawInPane(
          host,
          drawn,
          reading,
          s,
          on,
          depth,
          { state, relayout: laidOut },
          this.host.settings().noteCallouts === 'on',
          aidsOf(this.host.settings()),
        );
        if (!view) {
          if (d && drawn && 'reason' in drawn && drawn.reason === 'too-large') this.overview(host, d, reading);
          if (reading.tooLarge) this.inParts(host, s, reading.tooLarge, stale, on);
          return;
        }
        this.view = view;
        this.addChild(view);
      })
      .catch((e: unknown) => {
        host.empty();
        host.createDiv({
          cls: 'thoughtknot-banner',
          attr: { role: 'alert' },
          text: word('pane.engine-failed', { why: String(e) }),
        });
      });
  }
}
