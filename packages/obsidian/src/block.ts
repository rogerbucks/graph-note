// One gql block in a note (spec §3): a graph block is drawn, as built by the note's blocks up to it; anything else is
// shown as coloured code. A graph is never blank: what can be read is drawn and the rest is listed; when nothing can be
// read, or the engine cannot start, the text is shown with its problems or a banner.
import type { MarkdownPostProcessorContext } from 'obsidian';
import { completenessReport, draw, gqlBlocks, graphOfBlock, namesSharedSchema, readNote } from '@graph-note/core';
import type { Block, Drawn, Problem } from '@graph-note/core';
import type GraphNotePlugin from './main';
import { renderCode } from './code';
import { GraphView, renderProblems } from './view';
import type { ShownProblem } from './view';

/** Draws one gql block where the note shows it (spec §3): its graph with the bar, or its problems, or a prompt when it is empty. */
export async function renderBlock(
  plugin: GraphNotePlugin,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
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
  const reading = readNote(texts, index, shared);
  // a problem's line in the note: the block's fence line, plus its line in the block (1 = the line after the fence)
  const shown = (p: Problem): ShownProblem => ({ ...p, noteLine: (blocks[p.block]?.line ?? 0) + p.line });
  const problems = reading.problems.filter((p) => p.graph === graph).map(shown);
  const drawing = reading.graphs.get(graph);
  const target = { path: ctx.sourcePath, line: info?.lineStart ?? 0, graph };
  const root = el.createDiv({ cls: 'graph-note' });

  if (!drawing || !drawing.boxes.length) {
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
    return;
  }

  let drawn: Drawn;
  try {
    drawn = draw(drawing, await plugin.graphviz());
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
  let slot: HTMLElement | null = null;
  ctx.addChild(
    new GraphView(root, {
      reading,
      graph,
      drawn,
      problems,
      mode: 'note',
      completeness: completenessReport(reading, graph, new Date().toISOString().slice(0, 10)),
      lineOf: (at) => (blocks[at.block]?.line ?? 0) + at.line,
      onEdit: () => {
        void plugin.openEditor(target);
      },
      // edit here: the editor in place sits in the card; one already open for this block moves into the redrawn card
      onEditHere: () => {
        if (slot) void plugin.editHere(target, slot);
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
    }),
  );
}
