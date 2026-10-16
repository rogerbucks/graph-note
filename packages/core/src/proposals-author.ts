// The proposer, declared by the editor (editor spec §17, proposals_checked; the graph spec's §24): the check wants a change
// set's author to be a known person or model, and a set may declare its own. Only the editor does: it puts the declaration
// first among the proposal's additions when it writes the proposal — the Model, for an AI model set up in the settings
// (§19), or the Person that is a Step, for a graph step (§20) — unless the note already declares that proposer. It is
// ordinary data on the card, a change like the others, and lands in the graph only with the first change accepted from the
// proposal, and goes with the last one rejected. What a model writes can never declare an author (`ai-request.ts`).
import { proposerKind } from './proposals-check.ts';
import { makeProposal, valueGql } from './proposals.ts';
import type { Proposal, ProposedChange } from './proposals.ts';

const WORD = /^[A-Za-z_]\w*$/;

/** Why a declaration is there, said on the card. */
export const DECLARES = 'declares who proposed this, so that the graph spec’s check knows its author';

/** The declaration of a proposer, as an addition: a Model for a model, a Person that is a Step for a step; none for a person. */
function declarationOf(p: Proposal): string | null {
  const { name, kind } = p.provenance.by;
  if (!WORD.test(name) || (kind !== 'model' && kind !== 'step')) return null;
  return `(${name}:${kind === 'model' ? 'Model' : 'Person:Step'} {name: ${valueGql(name)}})`;
}

/** Whether a change is the declaration of the proposal's proposer: the first change, an addition of that name as a Model or a Person. */
export const declaresProposer = (p: Proposal, c: ProposedChange): boolean =>
  c === p.changes[0] &&
  c.op === 'add' &&
  new RegExp(`^\\(\\s*${p.provenance.by.name}\\s*:\\s*(?:Model|Person)\\b`).test(c.gql);

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
  const gql = declarationOf(p);
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
