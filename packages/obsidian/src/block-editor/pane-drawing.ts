// The drawing in the edit pane (spec §4): the graph as typed so far, drawn beside its text; choosing a box or a link in it
// selects where it is written in the text, and its Edit puts the focus back in the text. In place, in a drawing's card,
// the editor has none: the card's own drawing is its drawing. It is laid out apart from the interface, as every drawing
// is (spec §9): a graph typed or pasted past a limit is not drawn, and a banner beside its text says why.
import { Component } from 'obsidian';
import { ViewState, depthOf, parked, startingSwitches } from '@graph-note/core';
import type { Drawn, FocusDepth, NoteReading, PaneSession, Refusal } from '@graph-note/core';
import type GraphNotePlugin from '../main';
import { graphCard } from '../graph-card';
import { refusalBanner } from '../layout-worker/refusal-banner';
import type { Chosen, SwitchesShown } from '@graph-note/core/display/graph-view/view-options';
import { aidsOf } from '@graph-note/core/display/graph-view/viewer-aids';
import type { ViewerAids } from '@graph-note/core/display/graph-view/viewer-aids';

/** What choosing in the drawing does: Edit, a box or a link chosen, and the text replaced, as by an estimate's quick fix. */
interface Choosing {
  edit: () => void;
  select: (chosen: Chosen) => void;
  /** Says whether there was a field to replace the text in. */
  replace: (now: string) => boolean;
}

/**
 * An estimated link's quick fix in the pane (§3): the session's text becomes `now`, as the fix bar's fix makes it, only
 * while it is still `was`, as drawn, and the editor is still there. Says why nothing was written, or null.
 */
function fixInPane(s: PaneSession, on: Choosing, was: string, now: string): string | null {
  if (s.text !== was)
    return 'The text being edited is not as drawn, so nothing was written. Try again once the drawing is redrawn.';
  return on.replace(now) ? null : 'The editor is no longer open, so nothing was written.';
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
    host.createEl('p', { cls: 'graph-note-quiet', text: 'Nothing to draw yet. Start with a thing.' });
    return null;
  }
  if ('reason' in drawn) {
    refusalBanner(host, drawn);
    return null;
  }
  const card = host.createDiv({ cls: 'graph-note' });
  return graphCard(card, {
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
export class PaneDrawing extends Component {
  private view: ReturnType<typeof graphCard> | null = null;
  private readonly plugin: GraphNotePlugin;
  /** The pane's View menu (§25): started from the settings, kept while the pane redraws what is typed. */
  private state: ViewState | null = null;

  constructor(plugin: GraphNotePlugin) {
    super();
    this.plugin = plugin;
  }

  /** Takes the drawing away. */
  clear(): void {
    this.view?.unload();
    this.view = null;
  }

  /** Draws the session's graph, as read, into `host` — unless, by the time it is laid out, `stale` says it is not wanted. */
  redraw(host: HTMLElement, reading: NoteReading, s: PaneSession, stale: () => boolean, on: Choosing): void {
    const d = reading.graphs.get(s.graph);
    const state = (this.state ??= new ViewState(startingSwitches(this.plugin.settings)));
    const laidOut = (by: object) => (d ? this.plugin.layout(state.folded(d), by) : Promise.resolve(null));
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
        const depth = depthOf(this.plugin.settings.focusDepth);
        const view = drawInPane(
          host,
          drawn,
          reading,
          s,
          on,
          depth,
          { state, relayout: laidOut },
          this.plugin.settings.noteCallouts === 'on',
          aidsOf(this.plugin.settings),
        );
        if (!view) return;
        this.view = view;
        this.addChild(view);
      })
      .catch((e: unknown) => {
        host.empty();
        host.createDiv({
          cls: 'graph-note-banner',
          attr: { role: 'alert' },
          text: `The drawing engine could not start: ${String(e)}`,
        });
      });
  }
}
