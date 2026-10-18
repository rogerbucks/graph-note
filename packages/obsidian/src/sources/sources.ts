// A block that draws its graph from elsewhere (editor spec §20 gql_file_source, gql_file_missing; §7 view_of_another_note):
// `// graph: trip · FROM Graphs/trip.gql` or `· FROM [[Trip plan]]`.
// - Its card draws the whole graph as written there, read-only, with a line saying where it comes from.
// - It is drawn again when the source changes.
// - A source that is missing, moved or unreadable, or holds no such graph, is said in a sentence naming it.
//   The block shows as text, never a blank drawing. A source too large to read is shown under the banner a note's own blocks get. Views of the graph in
// the note draw from the same source (view-block.ts, `sourcedView`).
import type { MarkdownPostProcessorContext } from 'obsidian';
import {
  depthOf,
  lineInSource,
  readStyle,
  sourceFor,
  sourceOf,
  styledDrawing,
  underStrictness,
} from '@thoughtknot/core';
import type { Drawn, Refusal, SourceRead } from '@thoughtknot/core';
import type ThoughtKnotPlugin from '../main';
import { renderCode } from '@thoughtknot/core/display/code';
import { graphCard } from '../graph-card';
import { aidsOf } from '@thoughtknot/core/display/graph-view/viewer-aids';
import { renderProblems } from '@thoughtknot/core/display/graph-view/problems-list';
import { refusalBanner } from '@thoughtknot/core/display/refusal-banner';
import { editInPane } from '../edit-in-pane';
import { readFromVault, watchSource } from './source-read';
import { sourceAlert, sourceStrip } from './source-strip';

/**
 * The reading a graph of a note is drawn from when the note says it is written elsewhere (`· FROM`). It is one of:
 * - the source read, watched so the card is drawn again when it changes;
 * - the sentence saying why nothing can be drawn;
 * - null when the note draws `graph` from its own blocks.
 */
export async function sourcedView(
  plugin: ThoughtKnotPlugin,
  texts: string[],
  graph: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  redraw?: () => void,
): Promise<{ read: SourceRead } | { refused: string } | null> {
  const s = sourceFor(texts, graph);
  if (!s) return null;
  if ('fault' in s) return { refused: `Graph ${graph} cannot be drawn from elsewhere: ${s.fault}.` };
  const read = await readFromVault(plugin, s, ctx.sourcePath);
  watchSource(plugin, el, ctx, s, read, redraw);
  return 'refused' in read ? { refused: read.refused } : { read };
}

/** Draws a FROM block where the note shows it: the whole graph from its source, read-only, or why it cannot be drawn. */
export async function renderSourceBlock(
  plugin: ThoughtKnotPlugin,
  text: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  owner?: object,
  redraw?: () => void,
): Promise<void> {
  const root = el.createDiv({ cls: 'thoughtknot' });
  const s = sourceOf(text);
  // the block itself, its place after FROM among it, is edited in the pane, whatever its source holds (§4)
  const info = ctx.getSectionInfo(el);
  const target = info ? { path: ctx.sourcePath, line: info.lineStart, graph: s?.graph ?? '' } : null;
  editInPane(root.createDiv({ cls: 'thoughtknot-card-actions' }), plugin, target);
  if (!s || 'fault' in s) {
    sourceAlert(root, `This block cannot be drawn: ${s?.fault ?? 'it names no source'}.`);
    renderCode(root, text);
    return;
  }
  const read = await readFromVault(plugin, s, ctx.sourcePath);
  watchSource(plugin, el, ctx, s, read, redraw);
  if ('refused' in read) {
    sourceAlert(root, read.refused);
    renderCode(root, text);
    return;
  }
  sourceStrip(root, plugin, s, ctx.sourcePath);
  const graph = s.graph;
  if (read.reading.tooLarge) {
    // too large to read (spec §9): nothing of it was read, as a note's own blocks over the limits are not
    refusalBanner(root, read.reading.tooLarge);
    renderCode(root, text);
    return;
  }
  const reading = { ...read.reading, problems: underStrictness(read.reading.problems, plugin.settings) };
  const styling = readStyle(read.texts, graph, reading);
  // a problem's line is its line in the source, which is where it is fixed
  const problems = [...reading.problems, ...styling.problems]
    .filter((p) => p.graph === graph)
    .map((p) => ({ ...p, noteLine: lineInSource(read, p) }));
  const plain = reading.graphs.get(graph);
  if (!plain || !plain.boxes.length) {
    if (problems.length) renderProblems(root, problems, false);
    else
      root.createDiv({ cls: 'thoughtknot-empty', text: `Graph ${graph} has nothing in it yet where it is written.` });
    renderCode(root, text);
    return;
  }
  let drawn: Drawn | Refusal | null;
  try {
    drawn = await plugin.layout(styledDrawing(plain, styling.style, reading.world[graph]), owner);
  } catch (e) {
    console.error('ThoughtKnot could not draw', graph, e);
    sourceAlert(root, 'The drawing engine could not start, so this graph is shown as text.');
    renderCode(root, text);
    return;
  }
  if (!drawn) return; // no longer wanted: a newer drawing of this card was asked for, or the plugin unloaded
  if ('reason' in drawn) {
    refusalBanner(root, drawn);
    renderCode(root, text);
    return;
  }
  ctx.addChild(
    graphCard(root, {
      source: text,
      reading,
      graph,
      drawn,
      problems,
      mode: 'note',
      focusDepth: depthOf(plugin.settings.focusDepth),
      callouts: plugin.settings.noteCallouts === 'on',
      aids: aidsOf(plugin.settings),
      lineOf: (at) => lineInSource(read, at),
      // The data is written in the source, so the drawing is read-only here.
      // The strip opens a note to change it there, and Edit opens this block in the pane.
      onEdit: () => {
        if (target) void plugin.openEditor(target);
      },
      readOnly: () => true,
    }),
  );
}
