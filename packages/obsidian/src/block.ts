// One gql block in a note (spec §3): a graph block is drawn, as built by the note's blocks up to it; anything else is
// shown as coloured code. A graph is never blank: what can be read is drawn and the rest is listed; when nothing can be
// read, or the engine cannot start, or the graph is over a size or time limit (spec §9), the text is shown with its
// problems or a banner.
import { MarkdownRenderChild, Notice } from 'obsidian';
import type { Component, MarkdownPostProcessorContext } from 'obsidian';
import {
  completenessReport,
  gqlBlocks,
  graphOfBlock,
  namesSharedSchema,
  parked,
  readNote,
  underStrictness,
} from '@graph-note/core';
import type { Block, Drawn, Problem, Refusal } from '@graph-note/core';
import type GraphNotePlugin from './main';
import type { EditTarget } from './main';
import { renderCode } from './code';
import { GraphView } from './graph-view/graph-view';
import { readOnlyHere, settlePlacements, whenPlaced } from './graph-view/placement';
import { renderProblems } from './graph-view/problems-list';
import { refusalBanner } from './layout-worker/refusal-banner';
import type { ShownProblem } from './graph-view/problems-list';

/**
 * A graph shown as its text with a banner saying why it is not drawn (spec §9): too large, or its layout stopped. An
 * editor open in place keeps its place in the card, so the text can still be made small enough to draw.
 */
function asText(
  plugin: GraphNotePlugin,
  root: HTMLElement,
  source: string,
  why: Refusal,
  problems: ShownProblem[],
  target: EditTarget,
): void {
  refusalBanner(root, why);
  if (problems.length) renderProblems(root, problems, false);
  const editing = plugin.inlineFor(target.path, target.line);
  if (!editing) {
    renderCode(root, source);
    return;
  }
  const at = root.createDiv({ cls: 'graph-note-edit-slot' });
  whenPlaced(root, () => {
    if (readOnlyHere(root)) {
      at.remove();
      renderCode(root, source);
    } else editing.mount(at);
  });
}

/**
 * Draws one gql block where the note shows it, as `renderBlock` does, and draws it again in place whenever a setting
 * that changes how it is read or drawn changes (spec §21), until it leaves the page: what the last drawing added is
 * unloaded first, so nothing of it is left behind.
 */
export async function renderShown(
  plugin: GraphNotePlugin,
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
    await renderBlock(plugin, source, el, local, owner);
  };
  const keeper = new MarkdownRenderChild(el);
  keeper.register(plugin.watchSettings(() => void draw()));
  ctx.addChild(keeper);
  await draw();
}

/**
 * Draws one gql block where the note shows it (spec §3): its graph with the bar, or its problems, or a prompt when it is
 * empty. `owner` is what the drawing is for, such as Live Preview's card: a newer drawing for it replaces one not yet laid out.
 */
export async function renderBlock(
  plugin: GraphNotePlugin,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  owner?: object,
): Promise<void> {
  const graph = graphOfBlock(source);
  if (!graph) {
    renderCode(el, source);
    return;
  }

  const info = ctx.getSectionInfo(el);
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
    asText(plugin, el.createDiv({ cls: 'graph-note' }), source, reading.tooLarge, [], target);
    return;
  }
  // a problem's line in the note: the block's fence line, plus its line in the block (1 = the line after the fence)
  const shown = (p: Problem): ShownProblem => ({ ...p, noteLine: (blocks[p.block]?.line ?? 0) + p.line });
  const problems = reading.problems.filter((p) => p.graph === graph).map(shown);
  const drawing = reading.graphs.get(graph);
  const root = el.createDiv({ cls: 'graph-note' });

  if (!drawing || !drawing.boxes.length) {
    // while the block is edited in place, the editor keeps its place in the card through every redraw, even when
    // nothing can be drawn for a moment, such as just after a comma at a line's end (typing_keeps_focus, spec §4)
    const editing = plugin.inlineFor(target.path, target.line);
    if (editing) {
      if (problems.length) renderProblems(root, problems, false);
      const slot = root.createDiv({ cls: 'graph-note-edit-slot' });
      // reading view is read-only: there, the text and why, as when nothing is edited (spec §3)
      whenPlaced(root, () => {
        if (readOnlyHere(root)) {
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
    const empty = root.createDiv({ cls: 'graph-note-empty' });
    empty.createEl('p', {
      text: `Graph ${graph} has nothing in it yet. Start with a thing: write (name:Kind {name: 'Its text'}) below the graph line, or press Edit.`,
    });
    const edit = empty.createEl('button', { text: 'Edit', attr: { 'aria-label': 'Edit', type: 'button' } });
    edit.addEventListener('click', () => {
      void plugin.openEditor(target);
    });
    whenPlaced(root, () => {
      if (readOnlyHere(root)) edit.remove(); // reading view is read-only (spec §3)
    });
    return;
  }

  let drawn: Drawn | Refusal | null;
  try {
    drawn = await plugin.layout(drawing, owner);
  } catch (e) {
    console.error('Graph Note could not draw', graph, e);
    root.createDiv({
      cls: 'graph-note-banner',
      attr: { role: 'alert' },
      text: 'The drawing engine could not start, so this graph is shown as text. Any drawing generated earlier in this note may be stale.',
    });
    renderCode(root, source);
    return;
  }
  if (!drawn) return; // no longer wanted: a newer drawing of this card was asked for, or the plugin unloaded
  if ('reason' in drawn) {
    asText(plugin, root, source, drawn, problems, target);
    return;
  }
  let slot: HTMLElement | null = null;
  ctx.addChild(
    new GraphView(root, {
      source,
      reading,
      graph,
      drawn,
      problems,
      mode: 'note',
      completeness: completenessReport(reading, graph, new Date().toISOString().slice(0, 10)),
      parked: parked(reading, graph, new Date().toISOString().slice(0, 10)),
      indent: plugin.settings.indent,
      lineOf: (at) => (blocks[at.block]?.line ?? 0) + at.line,
      onEdit: () => {
        void plugin.openEditor(target);
      },
      // edit here: the editor in place sits in the card; one already open for this block moves into the redrawn card
      // a card just put on the page is acted on at once; one not yet on it says so, rather than doing nothing
      onEditHere: () => {
        if (!slot) settlePlacements();
        if (slot) void plugin.editHere(target, slot);
        else
          new Notice('This drawing is not on the page yet, so it cannot be edited here; edit it in the pane instead.');
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
    }),
  );
}
