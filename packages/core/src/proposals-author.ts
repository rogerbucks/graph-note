// The proposer, declared by the editor (editor spec §17, proposals_checked; the graph spec's §24): the check wants a change
// set's author to be a known person or model, and a set may declare its own. Only the editor does: it puts the declaration
// first among the proposal's additions when it writes the proposal — the Model, for an AI model set up in the settings
// (§19), or the Person that is a Step, for a graph step (§20) — unless the note already declares that proposer. It is
// ordinary data on the card, a change like the others, and lands in the graph only with the first change accepted from the
// proposal, and goes with the last one rejected. What a model writes can never declare an author (`ai-request.ts`).
import { items } from './block-items.ts';
import { graphOfBlock } from './blocks.ts';
import { proposerKind } from './proposals-check.ts';
import { DECIDER_DEFAULT } from './proposals-judgement.ts';
import type { Person } from './proposals-shown.ts';
import { makeProposal, valueGql } from './proposals.ts';
import type { Proposal, ProposedChange } from './proposals.ts';

const WORD = /^[A-Za-z_]\w*$/;

/** Why a declaration is there, said on the card. */
export const DECLARES = 'declares who proposed this, so that the graph spec’s check knows its author';

/** The declaration of a proposer, as an addition: a Model for a model, a Person that is a Step for a step; none for a person. */
function declarationOf(name: string, kind: 'model' | 'step'): string | null {
  return WORD.test(name) ? `(${name}:${kind === 'model' ? 'Model' : 'Person:Step'} {name: ${valueGql(name)}})` : null;
}

/**
 * Whether a change is the declaration of the proposal's proposer: the first change, and byte for byte what the editor
 * writes for that proposer, as a model or as a step (a note read back does not say which it was). Anything else that names
 * the author — more properties, a link, a path — is an ordinary change, accepted or rejected explicitly. Text is compared
 * as text: no pattern is made from the name.
 */
export const declaresProposer = (p: Proposal, c: ProposedChange): boolean =>
  c === p.changes[0] &&
  c.op === 'add' &&
  (['model', 'step'] as const).some((kind) => c.gql === declarationOf(p.provenance.by.name, kind));

/** Why this is not a person who decides, or null: a person gives a name, and what proposed a change cannot accept it. */
export function notAPerson(p: Proposal, by: unknown): string | null {
  const name = typeof (by as Person | null)?.name === 'string' ? (by as Person).name.trim() : '';
  if (!name) return 'a person decides: say who is deciding';
  const { name: proposer, kind } = p.provenance.by;
  // the same name in any case is the same proposer, as written: a proposer's name is one word, so no label with a space
  // is taken for it, and one called the_reader is none for the label "the reader"
  // ("you" is what the person at the keyboard is called when the settings name nobody: it is never taken for a proposer)
  const same = name.toLowerCase() === proposer.toLowerCase() && name !== DECIDER_DEFAULT;
  return same && kind !== 'person' ? `${proposer} proposed this, and is not a person: a person decides` : null;
}

/**
 * Whether this change is the declaration of the proposer and the proposal's graph holds exactly that declaration already
 * (byte for byte, as an item of a data block of the graph), which an earlier proposal from the same proposer accepted. It
 * is then written nowhere again and blocks nothing; a different node of the same name is not it, and is still refused.
 */
export function declarationHeld(p: Proposal, texts: readonly string[], c: ProposedChange): boolean {
  if (c.op !== 'add' || !declaresProposer(p, c)) return false;
  return texts.some((t) => graphOfBlock(t) === p.graph && items(t).some((it) => t.slice(it.from, it.to) === c.gql));
}

/** These changes to accept, with the declaration of the proposer written first among them if it still waits. */
export function acceptedWith(
  p: Proposal,
  waiting: readonly ProposedChange[],
  chosen: ProposedChange[],
): ProposedChange[] {
  const declaration = waiting.find((c) => declaresProposer(p, c));
  return declaration && !chosen.includes(declaration) ? [declaration, ...chosen] : chosen;
}

/**
 * These changes to reject, with the declaration of the proposer if everything else that waits is among them, so no Model
 * is left; or why not: it is not rejected on its own while other changes wait, since they would have no known author.
 */
export function rejectedWith(
  p: Proposal,
  waiting: readonly ProposedChange[],
  chosen: ProposedChange[],
): ProposedChange[] | string {
  const declaration = waiting.find((c) => declaresProposer(p, c));
  if (!declaration) return chosen;
  const left = waiting.filter((c) => c !== declaration && !chosen.includes(c));
  if (chosen.includes(declaration))
    return left.length ? `${DECLARES}: reject the changes that wait too, or accept one of them` : chosen;
  return left.length ? chosen : [declaration, ...chosen];
}

/**
 * The proposal with its proposer declared, as the first addition, for the note it will be written into; or as it was when
 * the note already declares the proposer, when it is declared already, or when the proposer is one the editor does not
 * declare (a person is declared by the person who owns the graph).
 */
export function withProposer(note: string, p: Proposal): Proposal | { refused: string } {
  const { kind } = p.provenance.by;
  const gql = kind === 'model' || kind === 'step' ? declarationOf(p.provenance.by.name, kind) : null;
  const first = p.changes[0];
  if (!gql || (first && declaresProposer(p, first)) || proposerKind(note, p.provenance.by.name) !== 'unknown') return p;
  const { id, graph, provenance } = p;
  return makeProposal({
    id,
    graph,
    by: provenance.by,
    at: provenance.at,
    read: provenance.read,
    basis: provenance.basis,
    changes: [{ op: 'add', gql, reason: DECLARES }, ...p.changes],
  });
}
