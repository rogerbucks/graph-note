// A view in a note (spec §2 views_in_the_note; §7): a query block named as a view, drawn as what it picks out of its graph,
// from the one data set and never a copy of it. A query outside the view profile is refused, saying what is allowed
// (view_profile); a view that matches nothing says so and offers to change it, never a blank drawing (empty_view); what
// is outside it is faded or hidden as its style graph says (fade_or_hide_in_style), its looks drawn with their legend,
// and how it is shown saved in the style graph when asked (view_saved_as_shown).
import { Notice, TFile } from 'obsidian';
import type { MarkdownPostProcessorContext } from 'obsidian';
import {
  addView,
  depthOf,
  evaluate,
  gqlBlocks,
  legendOf,
  lineInSource,
  lookOf,
  outsideOf,
  parseView,
  readNote,
  readStyle,
  readingOf,
  styleEdit,
  reversedLinks,
  styledDrawing,
  underStrictness,
} from '@graph-note/core';
import type { GraphDrawing, NamedView, Outside, StyleChange, ThingLook } from '@graph-note/core';
import type GraphNotePlugin from './main';
import { renderCode } from './code';
import { GraphView } from './graph-view/graph-view';
import { diagramShown, tableDrawn } from './graph-view/type-strip';
import type { ViewShown } from './graph-view/view-strip';
import { refusalBanner } from './layout-worker/refusal-banner';
import { dataExportBar } from './export/export-form';
import { sourcedView } from './sources/sources';
import { sourceAlert, sourceStrip } from './sources/source-strip';
import { linkHost } from './links/link-host';

/** Writes a change to the style graph of `graph` into the note at `path`, against the note as it is when written. */
export async function writeStyle(
  plugin: GraphNotePlugin,
  path: string,
  graph: string,
  change: StyleChange,
  done: string,
): Promise<void> {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return;
  let refused = '';
  await plugin.app.vault.process(file, (note) => {
    // a thing only suggested in the note as it is now is not styled until its name is written (§4)
    const r = styleEdit(note, graph, change);
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
  await plugin.app.vault.process(file, (note) => {
    // checked against the note as it is now: a name another view has, or a thing only suggested in it (§4), is refused
    const r = addView(note, graph, block);
    if ('note' in r) return r.note;
    refused = r.refused;
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
  redraw?: () => void,
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
  // a graph the note draws FROM another note or a file is read there, never copied here (§7, §20); else its own blocks
  const sourced = await sourcedView(plugin, texts, v.graph, el, ctx, redraw);
  if (sourced && 'refused' in sourced) {
    // the source missing, moved or unreadable: said, naming it, with the query as text, never a blank drawing
    sourceAlert(root, sourced.refused);
    renderCode(root, source);
    return;
  }
  const from = sourced?.read ?? null;
  const read = from ? from.reading : readNote(texts);
  if (read.tooLarge) {
    // too large to read (spec §9, layout_contained): nothing was read, so there is no graph for the view to match
    // nothing in — the query, and why, as a graph's text is shown
    refusalBanner(root, read.tooLarge);
    renderCode(root, source);
    return;
  }
  // where the data comes from, with the way to it, when it is written elsewhere (view_of_another_note)
  if (from) sourceStrip(root, plugin, from.source, ctx.sourcePath);
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
  // the View menu (§25): this view's own state, started as it was saved as shown, else as the settings say
  const state = plugin.switchesFor(ctx.sourcePath, v.graph, style, v.name);
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
    // the View menu's switches as they stand are saved with the view, and only then (§25, view_switch_view_only)
    setOutside: (o: Outside) =>
      void writeStyle(
        plugin,
        ctx.sourcePath,
        v.graph,
        { outside: { view: v.name, outside: o } },
        `View ${v.name} now ${o === 'hide' ? 'hides' : 'fades'} what is outside it.`,
      ),
    // and the legend's choices, only then too (§25, untangle_legend)
    saveShown: (z, selected, legend) =>
      void writeStyle(
        plugin,
        ctx.sourcePath,
        v.graph,
        {
          shown: {
            view: v.name,
            zoom: z.scale,
            x: z.x,
            y: z.y,
            ...(selected ? { selected } : {}),
            switches: state.saved(),
            legend,
          },
        },
        `Saved how view ${v.name} is shown.`,
      ),
  };
  // the diagram types for this view (§15): choosing one writes it for the view alone
  const diagram = diagramShown(drawing, style, g, v.name, (change, done) => {
    void writeStyle(plugin, ctx.sourcePath, v.graph, { diagram: change }, done);
  });
  let drawn;
  // styled as this view: its nudges, and the properties, arrowheads, type and moving links chosen for it or the whole
  // graph (§7, §14, §15); folded as its View menu says (§25)
  const styled = styledDrawing(drawing, style, g, v.name);
  const laidOut = (by?: object) => plugin.layout(state.folded(styled), by);
  try {
    drawn = diagram.table ? tableDrawn(diagram.table) : await laidOut(owner);
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
    // over a size or time limit: the query, with a banner saying which limit and the numbers, as a graph's text is; and
    // its data still offered for export, which needs no layout (spec §16, export_data_formats); an export reads this
    // note, so a view drawn from elsewhere offers none
    if (!from)
      dataExportBar(root, {
        path: ctx.sourcePath,
        graph: v.graph,
        view: { name: v.name, spec },
        theme: plugin.settings.exportTheme,
        run: (ask) => plugin.exportGraph(ask),
      });
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
      focusDepth: depthOf(plugin.settings.focusDepth),
      lineOf: (at) => (from ? lineInSource(from, at) : (blocks[at.block]?.line ?? 0) + at.line),
      onEdit: () => changeView(plugin, ctx.sourcePath, line),
      view,
      diagram,
      ...(diagram.table ? {} : { switches: { state, relayout: (by: object) => laidOut(by) } }),
      motion: { flow: styled.flow ?? [], reversed: reversedLinks(styled, drawn.rankdir) },
      // its links shown and followed as the graph's are (§18); a broken one is reported on the graph's own card
      links: { ...linkHost(plugin, ctx.sourcePath, v.graph), broken: [] },
      images: plugin.cardImages(ctx.sourcePath, styled.pictures), // its things' images and pictures (§18)
      // an export reads the note it is in: a view drawn from elsewhere is exported from where its data is written
      ...(from
        ? {}
        : {
            exporting: {
              path: ctx.sourcePath,
              graph: v.graph,
              view: { name: v.name, spec },
              theme: plugin.settings.exportTheme,
              run: (ask) => plugin.exportGraph(ask),
            },
          }),
    }),
  );
}
