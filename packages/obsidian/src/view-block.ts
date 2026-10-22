// A view in a note (spec §2 views_in_the_note; §7). It is a query block named as a view.
// It is drawn as what it picks out of its graph, from the one data set and never a copy of it.
// - A query outside the view profile is refused, saying what is allowed (view_profile).
// - A view that matches nothing says so and offers to change it, never a blank drawing (empty_view).
// - What is outside it is faded or hidden as its style graph says (fade_or_hide_in_style).
// - Its looks are drawn with their legend.
// - How it is shown is saved in the style graph when asked (view_saved_as_shown).
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
  word,
} from '@thoughtknot/core';
import type { GraphDrawing, NamedView, Outside, StyleChange, ThingLook } from '@thoughtknot/core';
import type ThoughtKnotPlugin from './main';
import { renderCode } from '@thoughtknot/core/display/code';
import { graphCard } from './graph-card';
import { aidsOf } from '@thoughtknot/core/display/graph-view/viewer-aids';
import { diagramShown, pictureDrawn, tableDrawn } from '@thoughtknot/core/display/graph-view/type-strip';
import { withPicture } from './outside/outside-diagrams';
import type { ViewShown } from '@thoughtknot/core/display/graph-view/view-strip';
import { refusalBanner } from '@thoughtknot/core/display/refusal-banner';
import { dataExportBar } from '@thoughtknot/core/display/export/export-form';
import { sourcedView } from './sources/sources';
import { sourceAlert, sourceStrip } from './sources/source-strip';
import { linkHost } from './links/link-host';

/** Writes a change to the style graph of `graph` into the note at `path`, against the note as it is when written. */
export async function writeStyle(
  plugin: ThoughtKnotPlugin,
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
  new Notice(refused ? word('blocks.style-failed', { why: refused }) : done);
}

/**
 * Writes a view block made by tapping (views_by_tapping) after the last block of its graph in the note at `path`.
 * It writes against the note as it is when written. Resolves to why it was not written, or null.
 */
export async function writeViewBlock(
  plugin: ThoughtKnotPlugin,
  path: string,
  graph: string,
  block: string,
): Promise<string | null> {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return word('blocks.view-note-gone');
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
function changeView(plugin: ThoughtKnotPlugin, path: string, line: number): void {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  const leaf = plugin.app.workspace.getLeaf(false);
  if (file instanceof TFile && typeof leaf.openFile === 'function')
    void leaf.openFile(file, { eState: { line }, active: true });
  else new Notice(word('blocks.view-edit'));
}

/** Draws the view `v`, written in `source`, where the note shows it. */
export async function renderViewBlock(
  plugin: ThoughtKnotPlugin,
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
  const root = el.createDiv({ cls: 'thoughtknot' });
  const spec = v.fault ? { refused: v.fault } : parseView(v.query);
  if ('refused' in spec) {
    root.createDiv({
      cls: 'thoughtknot-banner',
      attr: { role: 'alert' },
      text: word('blocks.view-refused', { why: spec.refused }),
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
    // Too large to read (spec §9, layout_contained). Nothing was read, so there is no graph for the view to match
    // nothing in. The query, and why, are shown as a graph's text is.
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
    const empty = root.createDiv({ cls: 'thoughtknot-empty' });
    empty.createEl('p', { text: word('blocks.view-empty', { name: v.name, why: result.why ?? '' }) });
    const change = empty.createEl('button', {
      text: word('blocks.view-change'),
      attr: { 'aria-label': word('blocks.view-change'), type: 'button' },
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
        word(o === 'hide' ? 'blocks.view-hides' : 'blocks.view-fades', { name: v.name }),
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
        word('blocks.view-saved', { name: v.name }),
      ),
  };
  // the diagram types for this view (§15): choosing one writes it for the view alone.
  // A type a plug-in from outside adds is drawn by that plug-in, when one turned on adds it (outside-diagrams.ts).
  const diagram = await withPicture(
    plugin.outside,
    diagramShown(drawing, style, g, v.name, (change, done) => {
      void writeStyle(plugin, ctx.sourcePath, v.graph, { diagram: change }, done);
    }),
    drawing,
    g,
    style.nudges,
  );
  let drawn;
  // Styled as this view (§7, §14, §15). That is its nudges, and the properties, arrowheads, type and moving links
  // chosen for it or the whole graph. Folded as its View menu says (§25).
  const styled = styledDrawing(drawing, style, g, v.name);
  const laidOut = (by?: object) => plugin.layout(state.folded(styled, by), by);
  try {
    drawn = diagram.table
      ? tableDrawn(diagram.table)
      : diagram.picture
        ? pictureDrawn(diagram.picture)
        : await laidOut(owner);
  } catch (e) {
    // a view whose drawing cannot be laid out shows its text and why, never a blank card
    console.error('ThoughtKnot could not draw view', v.name, e);
    root.createDiv({
      cls: 'thoughtknot-banner',
      attr: { role: 'alert' },
      text: word('blocks.view-failed', { name: v.name }),
    });
    renderCode(root, source);
    return;
  }
  if (!drawn) return; // no longer wanted: a newer drawing of this card was asked for, or the plugin unloaded
  if ('reason' in drawn) {
    // Over a size or time limit. The query shows with a banner saying which limit and the numbers, as a graph's text is.
    // Its data is still offered for export, which needs no layout (spec §16, export_data_formats).
    // An export reads this note, so a view drawn from elsewhere offers none.
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
    graphCard(root, {
      source,
      reading: shownReading,
      graph: v.graph,
      drawn,
      problems: [],
      mode: 'note',
      focusDepth: depthOf(plugin.settings.focusDepth),
      callouts: plugin.settings.noteCallouts === 'on',
      aids: aidsOf(plugin.settings),
      lineOf: (at) => (from ? lineInSource(from, at) : (blocks[at.block]?.line ?? 0) + at.line),
      onEdit: () => changeView(plugin, ctx.sourcePath, line),
      view,
      diagram,
      ...(diagram.table || diagram.picture ? {} : { switches: { state, relayout: (by: object) => laidOut(by) } }),
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
