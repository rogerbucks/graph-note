// An AI's answer as a proposal (editor spec §19, answers_are_proposals; §17): the changes it proposes are made into a
// proposal from the model, against the state of the graph that was sent, naming the record of the send; and the
// proposal is written into the note as a change set beside the graph — never into the graph, which changes only when a
// person accepts a change in the review.
import { gqlSpans, graphOfBlock } from './blocks.ts';
import { makeProposal } from './proposals.ts';
import type { ChangeInput, Proposal } from './proposals.ts';
import { changeSetText, oneWord } from './proposals-text.ts';
import { insertBlockAfter } from './store.ts';

/** What a proposal from an answer is made from: the record's id and time, the model, and what was sent. */
export interface AnswerSource {
  id: string;
  at: string;
  model: string;
  graph: string;
  said: string;
  basis: string;
}

/** The proposal the answer's changes make, from the model that gave them; or why they cannot make one. */
export function proposalFrom(changes: ChangeInput[], from: AnswerSource): Proposal | { refused: string } {
  return makeProposal({
    id: from.id,
    graph: from.graph,
    by: { name: oneWord(from.model), kind: 'model' },
    at: from.at,
    read: [`${from.said}`, `sent ${from.id} to ${from.model}`],
    basis: from.basis,
    changes,
  });
}

/**
 * The note with the proposal's change set written after the last block of its graph (after the last gql block when the
 * graph has none here), every other byte kept. The graph's own blocks are not touched.
 */
export function noteWithProposal(note: string, proposal: Proposal): string {
  const spans = gqlSpans(note);
  const own = spans.filter((s) => graphOfBlock(s.text) === proposal.graph);
  const after = own.at(-1) ?? spans.at(-1);
  const block = changeSetText(proposal);
  if (!after) return `${note}${note.endsWith('\n') || !note ? '' : '\n'}\n\`\`\`gql\n${block}\n\`\`\`\n`;
  const written = insertBlockAfter(note, { line: after.open, text: after.text }, block);
  return written.ok ? written.note : `${note}\n\`\`\`gql\n${block}\n\`\`\`\n`;
}
