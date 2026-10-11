// A view in a note (spec §2 views_in_the_note; §7): a query block named as a view, drawn as what it picks out of its graph,
// from the one data set and never a copy of it. A query outside the view profile is refused, saying what is allowed
// (view_profile); a view that matches nothing says so and offers to change it, never a blank drawing (empty_view); what
// is outside it is faded or hidden as its style graph says (fade_or_hide_in_style), its looks drawn with their legend,
// and how it is shown saved in the style graph when asked (view_saved_as_shown).
import { Notice, TFile } from 'obsidian';
import type { MarkdownPostProcessorContext } from 'obsidian';
import {
  evaluate,
  gqlBlocks,
  gqlSpans,
  graphOfBlock,
  insertBlockAfter,
  legendOf,
  lookOf,
  nudgedDrawing,
  outsideOf,
  parseView,
  readNote,
  readStyle,
  readingOf,
  styleEdit,
  underStrictness,
  viewsOf,
} from '@graph-note/core';
import type { GraphDrawing, NamedView, NoteReading, Outside, StyleChange, ThingLook } from '@graph-note/core';
import type GraphNotePlugin from './main';
import { renderCode } from './code';
import { GraphView } from './graph-view/graph-view';
import type { ViewShown } from './graph-view/view-strip';
import { refusalBanner } from './layout-worker/refusal-banner';

/** Writes a change to the style graph of `graph` into the note at `path`, against the note as it is when written. */
async function writeStyle(
  plugin: GraphNotePlugin,
  path: string,
  graph: string,
  change: StyleChange,
  done: string,
  reading: NoteReading,
): Promise<void> {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return;
  let refused = '';
  await plugin.app.vault.process(file, (note) => {
    // given the drawing, a thing drawn under a suggested name is not styled until its name is written (§4)
    const r = styleEdit(note, graph, change, reading);
    if ('refused' in r) refused = r.refused;
    return 'note' in r ? r.note : note;
  });
  // each write is confirmed in words, as is each refusal
  new Notice(refused ? `The style could not be written: ${refused}` : done);
}

/**
 * Writes a view block made by tapping (views_by_tapping) after the last block of its graph in the note at `path`,
 * against the note as it is when written; resolves to why it was not written, or null.
 */
export async function writeViewBlock(
  plugin: GraphNotePlugin,
  path: string,
  graph: string,
  block: string,
): Promise<string | null> {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return 'the note is not there any more';
  let refused: string | null = null;
  const name = viewsOf([block])[0]?.name;
  await plugin.app.vault.process(file, (note) => {
    const spans = gqlSpans(note);
    // a name another view of the graph has is refused before anything is written
    if (viewsOf(spans.map((s) => s.text)).some((v) => v.graph === graph && v.name === name)) {
      refused = `graph ${graph} already has a view called ${name}: give this one another name`;
      return note;
    }
    const last = spans.filter((s) => graphOfBlock(s.text) === graph).pop();
    const r = last ? insertBlockAfter(note, { line: last.open, text: last.text }, block) : null;
    if (r?.ok) return r.note;
    refused = r?.reason ?? `graph ${graph} is no longer in the note`;
    return note;
  });
  return refused;
}

/** Opens the note at the view's line, for its query to be changed there. */
function changeView(plugin: GraphNotePlugin, path: string, line: number): void {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  const leaf = plugin.app.workspace.getLeaf(false);
  if (file instanceof TFile && typeof leaf.openFile === 'function')
    void leaf.openFile(file, { eState: { line }, active: true });
  else new Notice('Change the view in its block in the note: its query picks the things it shows.');
}

/** Draws the view `v`, written in `source`, where the note shows it. */
export async function renderViewBlock(
  plugin: GraphNotePlugin,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  v: NamedView,
  owner?: object,
): Promise<void> {
  const info = ctx.getSectionInfo(el);
  const blocks = info ? gqlBlocks(info.text) : [{ text: source, line: 0 }];
  const texts = blocks.map((b) => b.text);
  const line = info?.lineStart ?? 0;
  const root = el.createDiv({ cls: 'graph-note' });
  const spec = v.fault ? { refused: v.fault } : parseView(v.query);
  if ('refused' in spec) {
    root.createDiv({
      cls: 'graph-note-banner',
      attr: { role: 'alert' },
      text: `This view cannot be drawn: ${spec.refused}`,
    });
    renderCode(root, source);
    return;
  }
  const read = readNote(texts);
  const reading = { ...read, problems: underStrictness(read.problems, plugin.settings) };
  const base = reading.graphs.get(v.graph);
  const result = evaluate(spec, reading, v.graph);
  const textOf = (k: string) => base?.boxes.find((b) => b.key === k)?.text ?? k;
  if (result.empty || !base) {
    const empty = root.createDiv({ cls: 'graph-note-empty' });
    empty.createEl('p', { text: `View ${v.name} matches nothing. ${result.why ?? ''}` });
    const change = empty.createEl('button', {
      text: 'Change the view',
      attr: { 'aria-label': 'Change the view', type: 'button' },
    });
    change.addEventListener('click', () => changeView(plugin, ctx.sourcePath, line));
    return;
  }
  const { style } = readStyle(texts, v.graph, reading);
  const outside = outsideOf(style, v.name);
  const things = new Set(result.things),
    links = new Set(result.links);
  // hidden: the drawing holds only the view; faded: it holds the whole graph, and what is outside the view is faded.
  // A link kept says which written link it is (`edge`), so its details are its own, never another's by position
  const g = reading.world[v.graph];
  const drawnKeys = new Set(base.boxes.map((b) => b.key));
  const baseEdges = g?.edges.filter(([s, , t]) => drawnKeys.has(s) && drawnKeys.has(t)) ?? [];
  const drawing: GraphDrawing =
    outside === 'hide'
      ? {
          ...base,
          boxes: base.boxes.filter((b) => things.has(b.key)),
          links: base.links.flatMap((l, i) =>
            links.has(i) ? [{ ...l, edge: g?.edges.indexOf(baseEdges[i] as (typeof baseEdges)[number]) }] : [],
          ),
          estimates: [],
        }
      : base;
  const shownReading = { ...reading, graphs: new Map(reading.graphs).set(v.graph, drawing) };
  const scope = { view: v.name };
  // a look may be given to a thing, or to its kind
  const lookOfThing = (b: { key: string; kind: string }): [string, ThingLook] => [
    b.key,
    lookOf(style, scope, { thing: b.key, kind: b.kind.split(' · ')[0] ?? '' }),
  ];
  const looks = {
    things: new Map(drawing.boxes.map(lookOfThing).filter(([, l]) => Object.keys(l).length)),
    links: new Map(
      drawing.links
        .map((l, i): [number, ThingLook] => [
          i,
          lookOf(style, scope, { link: { from: l.from, type: l.type, to: l.to } }),
        ])
        .filter(([, l]) => Object.keys(l).length),
    ),
  };
  const view: ViewShown = {
    name: v.name,
    reading: readingOf(spec, textOf),
    outside,
    faded:
      outside === 'hide'
        ? { things: [], links: [] }
        : {
            things: base.boxes.map((b) => b.key).filter((k) => !things.has(k)),
            links: base.links.flatMap((_, i) => (links.has(i) ? [] : [i])),
          },
    looks,
    // only the colours drawn here are in the legend, each with what it means
    legend: legendOf(style, scope).filter((e) =>
      [...looks.things.values(), ...looks.links.values()].some((l) => l.hue === e.colour),
    ),
    shown: style.shown.get(v.name),
    setOutside: (o: Outside) =>
      void writeStyle(
        plugin,
        ctx.sourcePath,
        v.graph,
        { outside: { view: v.name, outside: o } },
        `View ${v.name} now ${o === 'hide' ? 'hides' : 'fades'} what is outside it.`,
        reading,
      ),
    saveShown: (z, selected) =>
      void writeStyle(
        plugin,
        ctx.sourcePath,
        v.graph,
        { shown: { view: v.name, zoom: z.scale, x: z.x, y: z.y, ...(selected ? { selected } : {}) } },
        `Saved how view ${v.name} is shown.`,
        reading,
      ),
  };
  let drawn;
  try {
    drawn = await plugin.layout({ ...nudgedDrawing(drawing, style), nudges: style.nudges }, owner);
  } catch (e) {
    // a view whose drawing cannot be laid out shows its text and why, never a blank card
    console.error('Graph Note could not draw view', v.name, e);
    root.createDiv({
      cls: 'graph-note-banner',
      attr: { role: 'alert' },
      text: `View ${v.name} could not be drawn, so its query is shown.`,
    });
    renderCode(root, source);
    return;
  }
  if (!drawn) return; // no longer wanted: a newer drawing of this card was asked for, or the plugin unloaded
  if ('reason' in drawn) {
    // over a size or time limit: the query, with a banner saying which limit and the numbers, as a graph's text is
    refusalBanner(root, drawn);
    renderCode(root, source);
    return;
  }
  ctx.addChild(
    new GraphView(root, {
      source,
      reading: shownReading,
      graph: v.graph,
      drawn,
      problems: [],
      mode: 'note',
      lineOf: (at) => (blocks[at.block]?.line ?? 0) + at.line,
      onEdit: () => changeView(plugin, ctx.sourcePath, line),
      view,
      exporting: {
        path: ctx.sourcePath,
        graph: v.graph,
        view: { name: v.name, spec },
        theme: plugin.settings.exportTheme,
        run: (ask) => plugin.exportGraph(ask),
      },
    }),
  );
}
