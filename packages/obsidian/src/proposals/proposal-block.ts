// A change set in a note (spec §17). A block whose graph line says CHANGE SET is a proposal. It is drawn over its graph
// with what it adds, changes and removes marked. Each change is listed with Accept and Reject (proposal_shown_not_applied,
// proposal_one_by_one). Showing it writes nothing.
// - A person's Accept writes the change into the graph's block through the core's review. The review has the pane's own
//   session check it first (accepting_is_an_edit).
// - A Reject writes only the record in the note's judgement graph (rejecting_recorded).
// Both take the change out of the change set. Both go through the vault's API against the note as it is then, and can
// be undone. The card shows the graph spec's check of the change set.
import { Notice, TFile } from 'obsidian';
import type { MarkdownPostProcessorContext } from 'obsidian';
import {
  ProposalReview,
  changeSetId,
  deciderName,
  gqlSpans,
  namesSharedSchema,
  nudgedDrawing,
  readStyle,
  word,
} from '@thoughtknot/core';
import type { Which } from '@thoughtknot/core';
import type ThoughtKnotPlugin from '../main';
import { renderCode } from '@thoughtknot/core/display/code';
import { graphCard } from '../graph-card';
import { readOnlyHere, whenPlaced } from '@thoughtknot/core/display/graph-view/placement';
import { refusalBanner } from '@thoughtknot/core/display/refusal-banner';
import { renderProposalStrip } from '@thoughtknot/core/display/proposals/proposal-strip';
import type { ProposalCard } from '@thoughtknot/core/display/proposals/proposal-strip';
import { changeVaultNote } from '../storage/plugin-notes';

/**
 * Who decides here. Obsidian says nothing of who is at the keyboard. So it is the name set in the settings, exactly as
 * typed, or "you" when none is set (decider_named). The judgement graph records it with the time, beside what was
 * decided. The core compares a person's name with the proposer's as they are written, in any case.
 */
const personOf = (plugin: ThoughtKnotPlugin) => ({ name: deciderName(plugin.settings.decider) });

/** Opens the note at the change set's line, for its text to be read or changed there. */
function openAt(plugin: ThoughtKnotPlugin, path: string, line: number): void {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  const leaf = plugin.app.workspace.getLeaf(false);
  if (file instanceof TFile && typeof leaf.openFile === 'function')
    void leaf.openFile(file, { eState: { line }, active: true });
  else new Notice(word('blocks.proposal-edit'));
}

/** Draws the change set `source` where the note shows it: the proposal over its graph, or why it cannot be shown. */
export async function renderProposalBlock(
  plugin: ThoughtKnotPlugin,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  owner?: object,
  held?: string,
): Promise<void> {
  const root = el.createDiv({ cls: 'thoughtknot' });
  const info = ctx.getSectionInfo(el);
  const path = ctx.sourcePath;
  // with no section info, as when another plugin renders the block, the card cannot know which note it would write. It
  // shows the proposal and writes nothing, as in reading view (spec §3).
  // `held` is the note as it is when the card is drawn again after the change set was found changed under it
  const note = held ?? info?.text ?? source;
  // read with the note, which says what the proposer is and what has been decided of it already
  const read = ProposalReview.fromChangeSet(source, note);
  if ('refused' in read) {
    root.createDiv({
      cls: 'thoughtknot-banner',
      attr: { role: 'alert' },
      text: word('blocks.proposal-refused', { why: read.refused }),
    });
    renderCode(root, source);
    return;
  }
  const readOnly = () => !info || readOnlyHere(root);
  const review = plugin.reviewOf(path, read);
  review.shared = [...note.matchAll(/```gql\n([\s\S]*?)\n```/g)].some((m) => namesSharedSchema(m[1] ?? ''))
    ? await plugin.sharedSchemas()
    : [];
  const { reading, ...shown } = review.show(note);
  const graph = review.proposal.graph;

  // the card is drawn again from the note as it is, when the change set it was drawn from is not the note's any more
  let view: ReturnType<typeof graphCard> | undefined;
  const redraw = async (fresh: { block: string; note: string }) => {
    view?.unload();
    root.remove();
    await renderProposalBlock(plugin, fresh.block, el, ctx, owner, fresh.note);
  };
  type Change =
    { ok: true; note: string; said: string } | { ok: false; reason: string; again?: { block: string; note: string } };
  // a decision is written into the note against the note as it is then, and said in words
  const write = async (change: (now: string) => Change) => {
    // reading view never changes a note, whatever is called: nothing is decided there
    if (readOnly()) return word('blocks.proposal-read-only');
    const file = plugin.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return word('blocks.proposal-note-gone');
    let said = '';
    let again: { block: string; note: string } | undefined;
    await changeVaultNote(plugin.app, file.path, (now) => {
      const r = change(now);
      said = r.ok ? r.said : word('blocks.proposal-not-decided', { why: r.reason });
      if (!r.ok) again = r.again;
      return r.ok ? r.note : now;
    });
    new Notice(said);
    if (again) await redraw(again);
    return said;
  };
  /** The change set as the note holds it now, read again: what a decision is made on, never the card's own copy. */
  const heldNow = (now: string): { block: string } | null => {
    const span = gqlSpans(now).find((s) => {
      const h = changeSetId(s.text);
      return h?.id === review.proposal.id && h.graph === graph;
    });
    return span ? { block: span.text } : null;
  };
  const count = (n: number) => word('blocks.proposal-changes', { count: n });
  const card: ProposalCard = {
    id: review.proposal.id,
    graph,
    shown,
    decide: (kind: 'accept' | 'reject', which: Which, staleSeen: boolean) =>
      write((now): Change => {
        // the change set is read again from the note: a card drawn from one that was edited since decides nothing
        const held = heldNow(now);
        const current = held && ProposalReview.fromChangeSet(held.block, now);
        if (!held || !current || 'refused' in current) return { ok: false, reason: word('blocks.proposal-gone') };
        if (JSON.stringify(current.proposal) !== JSON.stringify(review.proposal))
          return {
            ok: false,
            reason: word('blocks.proposal-changed'),
            again: { block: held.block, note: now },
          };
        const r = review[kind](now, which, personOf(plugin), { staleSeen });
        if (!r.ok) return r;
        return {
          ...r,
          said:
            kind === 'accept'
              ? word('blocks.proposal-accepted', { changes: count(r.ids.length) })
              : word('blocks.proposal-rejected', { changes: count(r.ids.length) }),
        };
      }),
    undo: review.canUndo()
      ? () =>
          write((now) => {
            const r = review.undo(now);
            return r.ok ? { ...r, said: word('blocks.proposal-undone') } : r;
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
      cls: 'thoughtknot-empty',
      text: word('blocks.proposal-no-graph', { graph }),
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
    console.error('ThoughtKnot could not draw proposal', review.proposal.id, e);
    root.createDiv({
      cls: 'thoughtknot-banner',
      attr: { role: 'alert' },
      text: word('blocks.proposal-failed', { id: review.proposal.id }),
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
  view = graphCard(root, {
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
  });
  ctx.addChild(view);
}
