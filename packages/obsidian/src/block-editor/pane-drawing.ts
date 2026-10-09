// The drawing in the edit pane (spec §4): the graph as typed so far, drawn beside its text; choosing a box or a link in it
// selects where it is written in the text, and its Edit puts the focus back in the text. In place, in a drawing's card,
// the editor has none: the card's own drawing is its drawing.
import { Component } from 'obsidian';
import { draw } from '@graph-note/core';
import type { Engine, NoteReading, PaneSession } from '@graph-note/core';
import type GraphNotePlugin from '../main';
import { GraphView } from '../graph-view/graph-view';

/** What choosing in the drawing does: Edit, and a box or a link chosen. */
interface Choosing {
  edit: () => void;
  select: (chosen: { thing: string } | { link: number }) => void;
}

/** Draws the session's graph, as read, into the pane's drawing; returns the view, or null when there is nothing to draw yet. */
function drawInPane(host: HTMLElement, engine: Engine, reading: NoteReading, s: PaneSession, on: Choosing) {
  const d = reading.graphs.get(s.graph);
  host.empty();
  if (!d || !d.boxes.length) {
    host.createEl('p', { cls: 'graph-note-quiet', text: 'Nothing to draw yet. Start with a thing.' });
    return null;
  }
  const card = host.createDiv({ cls: 'graph-note' });
  return new GraphView(card, {
    reading,
    graph: s.graph,
    drawn: draw(d, engine),
    mode: 'pane',
    problems: reading.problems
      .filter((p) => p.graph === s.graph && reading.texts[p.block] === s.text)
      .map((p) => ({ ...p, noteLine: p.line })),
    lineOf: (at) => at.line,
    onEdit: on.edit,
    onSelect: on.select,
  });
}

/** The pane's drawing, redrawn from what is typed, once the drawing engine has started. */
export class PaneDrawing extends Component {
  private view: GraphView | null = null;
  private readonly plugin: GraphNotePlugin;

  constructor(plugin: GraphNotePlugin) {
    super();
    this.plugin = plugin;
  }

  /** Takes the drawing away. */
  clear(): void {
    this.view?.unload();
    this.view = null;
  }

  /** Draws the session's graph, as read, into `host` — unless, by the time the engine is ready, `stale` says it is not wanted. */
  redraw(host: HTMLElement, reading: NoteReading, s: PaneSession, stale: () => boolean, on: Choosing): void {
    void this.plugin
      .graphviz()
      .then((engine) => {
        if (stale()) return;
        this.clear();
        const view = drawInPane(host, engine, reading, s, on);
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
