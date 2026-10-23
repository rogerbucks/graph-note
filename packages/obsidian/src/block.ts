// One gql block in a note (spec §3). A graph block is drawn, as built by the note's blocks up to it. Anything else is
// shown as coloured code. A graph is never blank: what can be read is drawn and the rest is listed. Sometimes nothing
// can be read, or the engine cannot start, or the graph is over a size or time limit (spec §9). Then the text is shown
// with its problems or a banner.
import { MarkdownRenderChild, Notice, TFile } from 'obsidian';
import type { Component, MarkdownPostProcessorContext } from 'obsidian';
import {
  brokenLinks,
  changeSetId,
  completenessReport,
  depthOf,
  gqlBlocks,
  graphOfBlock,
  isSourceBlock,
  namesSharedSchema,
  parked,
  readNote,
  readStyle,
  replaceBlock,
  reversedLinks,
  stepOf,
  styledDrawing,
  styleOf,
  viewsOf,
  underStrictness,
  word,
} from '@thoughtknot/core';
import type { Block, Drawn, NudgeWrite, Problem, Refusal } from '@thoughtknot/core';
import type ThoughtKnotPlugin from './main';
import type { EditTarget } from './main';
import { renderCode } from '@thoughtknot/core/display/code';
import { waitShown } from '@thoughtknot/core/display/progress';
import { renderStyleBlock } from './style-block';
import { renderViewBlock, writeStyle, writeViewBlock } from './view-block';
import { renderProposalBlock } from './proposals/proposal-block';
import { renderSourceBlock } from './sources/sources';
import { renderStepBlock } from './step-block';
import { renderSchemaBlock } from './schema-block';
import { graphCard } from './graph-card';
import { renderEmpty, takeTour } from './first-run';
import { aidsOf } from '@thoughtknot/core/display/graph-view/viewer-aids';
import { diagramShown, pictureDrawn, tableDrawn } from '@thoughtknot/core/display/graph-view/type-strip';
import { withPicture } from './outside/outside-diagrams';
import { readOnlyHere, settlePlacements, whenPlaced } from '@thoughtknot/core/display/graph-view/placement';
import { renderProblems } from '@thoughtknot/core/display/graph-view/problems-list';
import { refusalBanner } from '@thoughtknot/core/display/refusal-banner';
import { dataExportBar } from '@thoughtknot/core/display/export/export-form';
import { showMassive } from './massive-card';
import type { ShownProblem } from '@thoughtknot/core/display/graph-view/problems-list';
import { linkHost, vaultNames } from './links/link-host';
import { changeVaultNote } from './storage/plugin-notes';

/**
 * A graph shown as its text with a banner saying why it is not drawn (spec §9): too large, or its layout stopped. An
 * editor open in place keeps its place in the card, so the text can still be made small enough to draw.
 */
function asText(
  plugin: ThoughtKnotPlugin,
  root: HTMLElement,
  source: string,
  why: Refusal,
  problems: ShownProblem[],
  target: EditTarget,
  readOnly: (card: HTMLElement) => boolean,
): void {
  refusalBanner(root, why);
  if (problems.length) renderProblems(root, problems, false);
  const editing = plugin.inlineFor(target.path, target.line);
  if (!editing) {
    renderCode(root, source);
    return;
  }
  const at = root.createDiv({ cls: 'thoughtknot-edit-slot' });
  whenPlaced(root, () => {
    if (readOnly(root)) {
      at.remove();
      renderCode(root, source);
    } else editing.mount(at);
  });
}

/**
 * Writes one block of the note at `path`, whose fence is on 1-based line `fence` (a `Block`'s line), as `now`. It writes
 * through the vault and against the note as it is then. It writes only while the block is still `was`. This is an
 * estimated link's quick fix (§3). Resolves to why nothing was written, or null.
 */
async function writeBlock(
  plugin: ThoughtKnotPlugin,
  path: string,
  fence: number,
  was: string,
  now: string,
): Promise<string | null> {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return word('blocks.note-gone');
  let refused: string | null = null;
  await changeVaultNote(plugin.app, file.path, (note) => {
    const r = replaceBlock(note, { line: fence - 1, text: was }, now);
    if (r.ok) return r.note;
    refused = word('blocks.changed');
    return note;
  });
  return refused;
}

/**
 * Draws one gql block where the note shows it, as `renderBlock` does. It draws it again in place whenever a setting
 * that changes how it is read or drawn changes (spec §21), until it leaves the page. What the last drawing added is
 * unloaded first, so nothing of it is left behind.
 */
export async function renderShown(
  plugin: ThoughtKnotPlugin,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  owner?: object,
): Promise<void> {
  const mine: Component[] = [];
  const local = Object.create(ctx) as MarkdownPostProcessorContext;
  local.addChild = (child: Component) => {
    mine.push(child);
    ctx.addChild(child as MarkdownRenderChild);
  };
  const draw = async () => {
    for (const child of mine.splice(0)) child.unload();
    el.empty();
    // a card drawn from another note or a file is drawn again when that source changes (§20)
    await renderBlock(plugin, source, el, local, owner, () => void draw());
  };
  const keeper = new MarkdownRenderChild(el);
  keeper.register(plugin.watchSettings(() => void draw()));
  // a diagram type looked at in this note, or put back (§15, type_try_reading)
  keeper.register(
    plugin.tried.watch((path) => {
      if (path === ctx.sourcePath) void draw();
    }),
  );
  ctx.addChild(keeper);
  await draw();
}

/**
 * Draws one gql block where the note shows it (spec §3). It draws its graph with the bar, or its problems, or a prompt
 * when it is empty. `owner` is what the drawing is for, such as Live Preview's card. A newer drawing for it replaces one not yet laid out.
 * `redraw` draws the card again, for one drawn from another note or a file when that source changes (§20).
 */
export async function renderBlock(
  plugin: ThoughtKnotPlugin,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  owner?: object,
  redraw?: () => void,
): Promise<void> {
  // a query block named as a view is drawn as the view (§7)
  const view = viewsOf([source])[0];
  if (view) return renderViewBlock(plugin, source, el, ctx, view, owner, redraw);
  // a block drawn from another note or a .gql file (§20), and a graph step, run only when asked (§20)
  if (isSourceBlock(source)) return renderSourceBlock(plugin, source, el, ctx, owner, redraw);
  const step = stepOf(source);
  if (step) return renderStepBlock(plugin, source, el, ctx, step);
  // a change set is a proposal, drawn over its graph and decided change by change (§17)
  if (changeSetId(source)) return renderProposalBlock(plugin, source, el, ctx, owner);
  const styled = styleOf(source);
  if (styled) {
    // a style block is never drawn as a graph: folded away until opened (§2)
    const all = gqlBlocks(ctx.getSectionInfo(el)?.text ?? '').map((b) => b.text);
    renderStyleBlock(el, source, styled, all.includes(source) ? all : [...all, source]);
    return;
  }
  // a block that holds only a schema, a graph's own or a shared one, is drawn as the schema itself (§3, schema_drawn)
  if (await renderSchemaBlock(plugin, source, el, ctx, owner)) return;
  const graph = graphOfBlock(source);
  if (!graph) {
    renderCode(el, source);
    return;
  }

  const info = ctx.getSectionInfo(el);
  // with no section info, as when another plugin renders the block, the card cannot know where it would write. It
  // cannot know which line of which note. So it is read-only, as in reading view (spec §3)
  const readOnly = (card: HTMLElement) => !info || readOnlyHere(card);
  let blocks: Block[] = info ? gqlBlocks(info.text) : [];
  let index = info ? blocks.findIndex((b) => b.line - 1 === info.lineStart) : -1;
  if (index < 0) {
    blocks = [{ text: source, line: 0 }];
    index = 0;
  } // shown on its own, as in a hover preview
  const texts = blocks.map((b, i) => (i === index ? source : b.text));

  const shared = texts.some(namesSharedSchema) ? await plugin.sharedSchemas() : [];
  const read = readNote(texts, index, shared);
  // reported by the strictness set on the settings page (spec §21)
  const reading = { ...read, problems: underStrictness(read.problems, plugin.settings) };
  const target = { path: ctx.sourcePath, line: info?.lineStart ?? 0, graph };
  if (reading.tooLarge) {
    // too large to read (spec §9): nothing was read, so the text is shown, and why
    asText(plugin, el.createDiv({ cls: 'thoughtknot' }), source, reading.tooLarge, [], target, readOnly);
    return;
  }
  // a problem's line in the note: the block's fence line, plus its line in the block (1 = the line after the fence)
  const shown = (p: Problem): ShownProblem => ({ ...p, noteLine: (blocks[p.block]?.line ?? 0) + p.line });
  // its style graph (§2). What is wrong in it is listed with the graph's problems. What is sound is drawn: its nudges
  // (§6), the properties it shows inline (§14) and the arrowheads it hides (§15)
  const styling = readStyle(texts, graph, reading);
  // its links followed through Obsidian, and each that names nothing in the vault a problem with its fix (§18)
  const followed = linkHost(plugin, target.path, graph);
  let names: string[] | undefined; // the vault's names, listed only once a link is found broken
  const broken = brokenLinks(reading, graph, {
    found: followed.found,
    get names() {
      return (names ??= vaultNames(plugin));
    },
  });
  const links = { ...followed, broken };
  const problems = [...reading.problems, ...styling.problems, ...broken.map((b) => b.problem)]
    .filter((p) => p.graph === graph)
    .map(shown);
  const plain = reading.graphs.get(graph);
  // drawn as the diagram type looked at in reading view, if one is, never saved (§15, type_try_reading)
  const at = { path: target.path, graph };
  const looked = plain && plugin.tried.styleFor(at, plain, styling.style, reading.world[graph]);
  const drawing = plain && styledDrawing(plain, looked ? looked.style : styling.style, reading.world[graph]);
  // the diagram types (§15): which fit, the one suggested and the one drawn; choosing one writes it in the style graph.
  // A type a plug-in from outside adds is drawn by that plug-in, when one turned on adds it (outside-diagrams.ts).
  const diagram =
    plain &&
    looked &&
    (await withPicture(
      plugin.outside,
      diagramShown(
        plain,
        looked.style,
        reading.world[graph],
        undefined,
        (change, done) => {
          plugin.tried.forget(at); // saved: no longer only looked at
          void writeStyle(plugin, target.path, graph, { diagram: change }, done);
        },
        looked.trying,
      ),
      plain,
      reading.world[graph],
      styling.style.nudges,
    ));
  const root = el.createDiv({ cls: 'thoughtknot' });

  if (!drawing || !drawing.boxes.length) {
    // while the block is edited in place, the editor keeps its place in the card through every redraw. This holds even
    // when nothing can be drawn for a moment. An example is just after a comma at a line's end (typing_keeps_focus, spec §4)
    const editing = plugin.inlineFor(target.path, target.line);
    if (editing) {
      if (problems.length) renderProblems(root, problems, false);
      const slot = root.createDiv({ cls: 'thoughtknot-edit-slot' });
      // reading view is read-only: there, the text and why, as when nothing is edited (spec §3)
      whenPlaced(root, () => {
        if (readOnly(root)) {
          slot.remove();
          renderCode(root, source);
        } else editing.mount(slot);
      });
      return;
    }
    if (problems.length) {
      // nothing could be read: the text, and why
      renderProblems(root, problems, false);
      renderCode(root, source);
      return;
    }
    renderEmpty(plugin, root, target, source, readOnly); // with an example to start from (§44, first_run_help)
    return;
  }

  // the View menu (§25). One state for every card of this graph in this note, folding it as its switches say. A graph
  // drawn as a table has none
  const state = diagram?.table || diagram?.picture ? undefined : plugin.switchesFor(target.path, graph, styling.style);
  const laidOut = (by?: object) => plugin.layout(state ? state.folded(drawing, by) : drawing, by);
  let drawn: Drawn | Refusal | null;
  try {
    // a graph drawn as a table is the plugin's own table, never laid out (§15)
    const laid = diagram?.table
      ? tableDrawn(diagram.table)
      : diagram?.picture
        ? pictureDrawn(diagram.picture)
        : await waitShown(root, word('progress.drawing'), () => laidOut(owner));
    if (laid === 'stopped') {
      // a layout the person stopped (§44, progress_shown): its graph is shown as text, and its result is not used
      root.createDiv({ cls: 'thoughtknot-banner', attr: { role: 'status' }, text: word('progress.drawing-stopped') });
      renderCode(root, source);
      return;
    }
    drawn = laid;
  } catch (e) {
    console.error('ThoughtKnot could not draw', graph, e);
    root.createDiv({
      cls: 'thoughtknot-banner',
      attr: { role: 'alert' },
      text: word('blocks.engine-failed'),
    });
    renderCode(root, source);
    return;
  }
  if (!drawn) return; // no longer wanted: a newer drawing of this card was asked for, or the plugin unloaded
  if ('reason' in drawn) {
    // too large to draw, but not to export: its data needs no layout (spec §16, export_data_formats)
    dataExportBar(root, {
      path: target.path,
      graph,
      theme: plugin.settings.exportTheme,
      run: (ask) => plugin.exportGraph(ask),
    });
    // too large to draw whole: its overview, to search and fly to any thing in it (§53, scale_massive_card)
    if (drawn.reason === 'too-large') showMassive(plugin, root, drawing, { ...target, reading, styling, readOnly });
    asText(plugin, root, source, drawn, problems, target, readOnly);
    return;
  }
  let slot: HTMLElement | null = null;
  ctx.addChild(
    graphCard(root, {
      source,
      reading,
      graph,
      drawn,
      problems,
      mode: 'note',
      ...(diagram ? { diagram } : {}),
      ...(state ? { switches: { state, relayout: (by: object) => laidOut(by) } } : {}),
      // a box dragged is moved, its place written in the style graph as a nudge (§6, drag_moves_box)
      ...(diagram?.table || diagram?.picture
        ? {}
        : {
            moving: {
              written: styling.style.nudges,
              ...(drawing.diagram?.type === 'radial' ? { centre: drawing.diagram.centre } : {}),
              move: (nudge: NudgeWrite, done: string) => void writeStyle(plugin, target.path, graph, { nudge }, done),
            },
          }),
      // the links its style graph moves, and the lines laid out backwards (§7)
      motion: { flow: drawing.flow ?? [], reversed: reversedLinks(drawing, drawn.rankdir) },
      links,
      // its things' images, found from this note, and the pictures its style draws on boxes (§18)
      images: plugin.cardImages(target.path, drawing.pictures),
      completeness: completenessReport(reading, graph, new Date().toISOString().slice(0, 10)),
      parked: parked(reading, graph, new Date().toISOString().slice(0, 10)),
      writeView: (block) => writeViewBlock(plugin, target.path, graph, block),
      exporting: {
        path: target.path,
        graph,
        theme: plugin.settings.exportTheme,
        run: (ask) => plugin.exportGraph(ask),
      },
      indent: plugin.settings.indent,
      focusDepth: depthOf(plugin.settings.focusDepth),
      callouts: plugin.settings.noteCallouts === 'on',
      aids: aidsOf(plugin.settings),
      lineOf: (at) => (blocks[at.block]?.line ?? 0) + at.line,
      onEdit: () => {
        void plugin.openEditor(target);
      },
      // edit here: the editor in place sits in the card. One already open for this block moves into the redrawn card.
      // A card just put on the page is acted on at once. One not yet on it says so, rather than doing nothing.
      // Given `at`, such as an estimated link's Edit the link (§3), the editor opens with where it is written selected
      onEditHere: (at) => {
        if (!slot) settlePlacements();
        if (slot)
          void plugin.editHere(target, slot).then(() => {
            if (at) plugin.inlineFor(target.path, target.line)?.reveal(at);
          });
        else new Notice(word('blocks.not-on-page'));
      },
      onDoneEditing: () => {
        void plugin.inlineFor(target.path, target.line)?.done();
      },
      watchEditing: (changed) => plugin.watchInline(changed),
      onReady: (at) => {
        slot = at;
        plugin.inlineFor(target.path, target.line)?.mount(at);
      },
      editing: () => plugin.inlineFor(target.path, target.line),
      onSelect: (chosen) => plugin.inlineFor(target.path, target.line)?.reveal(chosen),
      writeBlock: (n, was, now) => writeBlock(plugin, target.path, blocks[n]?.line ?? 0, was, now),
      tour: takeTour(), // the first drawing after an example opens the tour (§44, first_run_help)
      ...(info ? {} : { readOnly: () => true }),
    }),
  );
}
