// The proposals a note holds, as the card shows them, and a person's decision about one (spec §17, §26
// cc_claude_proposes). It is the core's own review, run on the note's text. Nothing here touches the DOM or the server.
// - `proposalsIn` reads each change set the note holds, with what the note's judgement graph says was decided of it. It
//   shows it over the note without writing anything.
// - `decide` is the user's accept or reject. It gives back the note's new text. The page sends it through its own,
//   version-checked write.
// The decider is the name set in the settings, else "you". What proposed a change, Claude among it, cannot decide it.
import { gqlSpans } from '../../core/src/blocks.ts';
import { deciderName } from '../../core/src/proposals-judgement.ts';
import { ProposalReview } from '../../core/src/proposals-review.ts';
import type { ProposalShown, Reviewed, Which } from '../../core/src/proposals-shown.ts';
import { changeSetId } from '../../core/src/proposals-text.ts';
import { word } from '../../core/src/words.ts';

/** One proposal as the card shows it. */
export interface Card {
  id: string;
  /** Who the change set says proposed it. */
  by: string;
  shown: ProposalShown;
  /** The changes still waiting for a decision, and how many of them are decided already. */
  rows: ProposalShown['rows'];
}

/** The review of the change set `id` in the note, or why it cannot be read. */
function reviewOf(note: string, id: string): ProposalReview | { refused: string } {
  const span = gqlSpans(note).find((s) => changeSetId(s.text)?.id === id);
  return span ? ProposalReview.fromChangeSet(span.text, note) : { refused: word('page.no-proposal', { id }) };
}

/** The proposals in the note that still have a change waiting, each shown over the note with nothing written. */
export function proposalsIn(note: string): Card[] {
  const cards: Card[] = [];
  for (const span of gqlSpans(note)) {
    const header = changeSetId(span.text);
    if (!header) continue;
    const review = reviewOf(note, header.id);
    if ('refused' in review || !review.pending().length) continue;
    const shown = review.show(note);
    cards.push({ id: header.id, by: review.proposal.provenance.by.name, shown, rows: shown.rows });
  }
  return cards;
}

/**
 * The user's decision on a proposal: accept or reject `which` of its changes. `decider` is the settings' text for who
 * decides (spaces or nothing is "you"). `staleSeen` says the user has read that the graph moved since it was proposed.
 */
export function decide(
  note: string,
  id: string,
  action: 'accept' | 'reject',
  which: Which,
  decider: string | null | undefined,
  staleSeen: boolean,
): Reviewed {
  const review = reviewOf(note, id);
  if ('refused' in review) return { ok: false, reason: review.refused };
  const by = { name: deciderName(decider) };
  return action === 'accept' ? review.accept(note, which, by, { staleSeen }) : review.reject(note, which, by);
}
