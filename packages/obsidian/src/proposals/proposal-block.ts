// A change set in a note (spec §17): a block whose graph line says CHANGE SET is a proposal, drawn over its graph with
// what it adds, changes and removes marked, and listed with Accept and Reject for each change (proposal_shown_not_applied,
// proposal_one_by_one). Showing it writes nothing. A person's Accept writes the change into the graph's block through the
// core's review, which has the pane's own session check it first (accepting_is_an_edit); a Reject writes only the record
// in the change set (rejecting_recorded). Both go through the vault's API against the note as it is then, and can be undone.
import { Notice, TFile } from 'obsidian';
import type { MarkdownPostProcessorContext } from 'obsidian';
import { ProposalReview, namesSharedSchema, nudgedDrawing, readStyle } from '@graph-note/core';
import type { Which } from '@graph-note/core';
import type GraphNotePlugin from '../main';
import { renderCode } from '../code';
import { GraphView } from '../graph-view/graph-view';
import { readOnlyHere, whenPlaced } from '../graph-view/placement';
import { refusalBanner } from '../layout-worker/refusal-banner';
import { renderProposalStrip } from './proposal-strip';
import type { ProposalCard } from './proposal-strip';

/**
 * Who decides here. Obsidian says nothing of who is at the keyboard, so it is the reader: the change set records "the
 * reader", with the time, beside what was decided. A label with a space can never be a proposer's name, which is one
 * word, so a proposer called anything at all, "you" among it, never stands in this person's way.
 */
const PERSON = { name: 'the reader' };

/** Opens the note at the change set's line, for its text to be read or changed there. */
function openAt(plugin: GraphNotePlugin, path: string, line: number): void {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  const leaf = plugin.app.workspace.getLeaf(false);
  if (file instanceof TFile && typeof leaf.openFile === 'function')
    void leaf.openFile(file, { eState: { line }, active: true });
  else new Notice('Read and change the change set in its block in the note.');
}

/** Draws the change set `source` where the note shows it: the proposal over its graph, or why it cannot be shown. */
export async function renderProposalBlock(
  plugin: GraphNotePlugin,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  owner?: object,
): Promise<void> {
  const root = el.createDiv({ cls: 'graph-note' });
  const read = ProposalReview.fromChangeSet(source);
  if ('refused' in read) {
    root.createDiv({
      cls: 'graph-note-banner',
      attr: { role: 'alert' },
      text: `This change set cannot be shown: ${read.refused}`,
    });
    renderCode(root, source);
    return;
  }
  const info = ctx.getSectionInfo(el);
  const path = ctx.sourcePath;
  // with no section info, as when another plugin renders the block, the card cannot know which note it would write: it
  // shows the proposal and writes nothing, as in reading view (spec §3)
  const note = info?.text ?? source;
  const readOnly = () => !info || readOnlyHere(root);
  const review = plugin.reviewOf(path, read);
  review.shared = [...note.matchAll(/```gql\n([\s\S]*?)\n```/g)].some((m) => namesSharedSchema(m[1] ?? ''))
    ? await plugin.sharedSchemas()
    : [];
  const { reading, ...shown } = review.show(note);
  const graph = review.proposal.graph;

  // a decision is written into the note against the note as it is then, and said in words
  const write = async (
    change: (now: string) => { ok: true; note: string; said: string } | { ok: false; reason: string },
  ) => {
    // reading view never changes a note, whatever is called: nothing is decided there
    if (readOnly()) return 'This note is only being read here, so nothing was decided.';
    const file = plugin.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return 'The note is not there any more, so nothing was decided.';
    let said = '';
    await plugin.app.vault.process(file, (now) => {
      const r = change(now);
      said = r.ok ? r.said : `Nothing was decided: ${r.reason}`;
      return r.ok ? r.note : now;
    });
    new Notice(said);
    return said;
  };
  const count = (n: number) => `${n} change${n === 1 ? '' : 's'}`;
  const card: ProposalCard = {
    id: review.proposal.id,
    graph,
    shown,
    decide: (kind: 'accept' | 'reject', which: Which, staleSeen: boolean) =>
      write((now) => {
        const r = review[kind](now, which, PERSON, { staleSeen });
        if (!r.ok) return r;
        return {
          ...r,
          said:
            kind === 'accept'
              ? `Accepted ${count(r.ids.length)}: written into the graph. Undo takes them back.`
              : `Rejected ${count(r.ids.length)}: the graph is unchanged, and the change set records it.`,
        };
      }),
    undo: review.canUndo()
      ? () =>
          write((now) => {
            const r = review.undo(now);
            return r.ok ? { ...r, said: 'Undone: the note is as it was before the last decision.' } : r;
          })
      : null,
  };

  const plain = reading.graphs.get(graph);
  if (!plain || !plain.boxes.length) {
    // with no drawing there is no card to gate: the buttons are taken away where the note is only read
    const writes = renderProposalStrip(root, card);
    whenPlaced(root, () => {
      if (readOnly()) writes.forEach((b) => b.remove());
    });
    root.createDiv({
      cls: 'graph-note-empty',
      text: `Graph ${graph} has nothing to draw in this note, so the proposal is listed without a drawing.`,
    });
    return;
  }
  // drawn with its style graph's nudges, as the graph itself is, so the proposal lies over the graph as it looks
  const styling = readStyle(reading.texts, graph, reading);
  const drawing = { ...nudgedDrawing(plain, styling.style), nudges: styling.style.nudges };
  let drawn;
  try {
    drawn = await plugin.layout(drawing, owner);
  } catch (e) {
    console.error('Graph Note could not draw proposal', review.proposal.id, e);
    root.createDiv({
      cls: 'graph-note-banner',
      attr: { role: 'alert' },
      text: `Proposal ${review.proposal.id} could not be drawn, so its change set is shown.`,
    });
    renderCode(root, source);
    return;
  }
  if (!drawn) return; // no longer wanted: a newer drawing of this card was asked for, or the plugin unloaded
  if ('reason' in drawn) {
    refusalBanner(root, drawn);
    renderCode(root, source);
    return;
  }
  ctx.addChild(
    new GraphView(root, {
      source,
      reading: { ...reading, graphs: new Map(reading.graphs).set(graph, drawing) },
      graph,
      drawn,
      problems: [],
      mode: 'note',
      lineOf: (at) => at.line + (info?.lineStart ?? 0),
      onEdit: () => openAt(plugin, path, info?.lineStart ?? 0),
      proposal: card,
      ...(info ? {} : { readOnly: () => true }),
    }),
  );
}
