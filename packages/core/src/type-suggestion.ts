// A change to a type that its instances suggest (editor spec §27, type_suggestion_bundle). When most instances of a
// type set a property to the same value, the type itself may be wrong. That change is offered, never made: it is a
// proposal (proposals.ts), labelled, that waits in the review like any other. A person accepts it in one step and can
// undo it in one step. The review records who proposed it and who accepted it (proposal_provenance).
//
// A change to a type that grants permissions, or to one kept as history, is always marked for a closer look. An
// instance links to its type with INSTANCE_OF (the graph spec's types-instances.js). Nothing here writes a note.
import gs from '@thoughtknot/graph-spec';
import type { Graph, Value } from '@thoughtknot/graph-spec';
import { gqlSpans } from './blocks.ts';
import { readNote } from './drawing.ts';
import { withProposer } from './proposals-author.ts';
import { basisOf } from './proposals-basis.ts';
import { makeProposal } from './proposals.ts';
import type { Proposal, Proposer } from './proposals.ts';
import { changeSetText } from './proposals-text.ts';
import { word } from './words.ts';

/** Why a suggestion needs a closer look: its type grants permissions, or is kept as history. */
export type CloserLook = 'permission' | 'historical';

/** A suggested change to a type, as a proposal to review, with the instances it rests on. */
export interface TypeSuggestion {
  proposal: Proposal;
  label: string;
  closerLook: CloserLook[];
  evidence: { type: string; key: string; value: Value; instances: string[]; of: number };
}

/** How strong the evidence must be: the share of instances that agree, and how few instances are too few. */
export interface SuggestionLimits {
  least?: number;
  fewest?: number;
  /** When the suggestion is made (an ISO day, or day and time). */
  at?: string;
}

/** Who makes these suggestions: a graph step, never a person. */
export const TYPE_SUGGESTER: Proposer = { name: 'type_suggestions', kind: 'step' };

const PERMISSION_LABELS = ['Role', 'Permission'];
const PERMISSION_KEYS = ['permission', 'permissions', 'grants', 'access'];

/** A value as GQL writes it: text quoted, a number as written, TRUE or FALSE; null for any other. */
function gqlOf(v: Value): string | null {
  if (typeof v === 'string') return gs.quote(v);
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return null;
}

/**
 * The changes to the types of `graph` that their instances suggest, strongest first. A type needs `fewest` instances
 * (3 by default). At least a share `least` of them (three in four by default) must set one value it lacks.
 */
export function typeSuggestions(note: string, graph: string, limits: SuggestionLimits = {}): TypeSuggestion[] {
  const { least = 0.75, fewest = 3, at } = limits;
  const world = readNote(gqlSpans(note).map((s) => s.text)).world;
  const g = world[graph];
  if (!g) return [];
  const out: TypeSuggestion[] = [];
  for (const type of g.nodes.keys()) {
    const instances = gs.instancesOf(world, graph, type).filter((i) => i.graph === graph);
    if (instances.length < fewest) continue;
    const own = gs.inherited(world, graph, type).props;
    const counts = new Map<string, { key: string; value: Value; instances: string[] }>();
    for (const { key: id } of instances)
      for (const [key, value] of Object.entries(g.p(id))) {
        if (key === 'id' || gqlOf(value) === null) continue;
        const said = `${key}=${JSON.stringify(value)}`;
        const c = counts.get(said) ?? { key, value, instances: [] };
        c.instances.push(id);
        counts.set(said, c);
      }
    for (const c of counts.values()) {
      if (c.instances.length / instances.length < least || own[c.key] === c.value) continue;
      const suggestion = suggest(note, g, graph, type, c, instances.length, at);
      if (suggestion) out.push(suggestion);
    }
  }
  return out.sort((a, b) => b.evidence.instances.length / b.evidence.of - a.evidence.instances.length / a.evidence.of);
}

/** One suggestion: the proposal to set the type's property, with its label and any closer look it needs. */
function suggest(
  note: string,
  g: Graph,
  graph: string,
  type: string,
  c: { key: string; value: Value; instances: string[] },
  of: number,
  at?: string,
): TypeSuggestion | null {
  const [labels, props] = g.nodes.get(type) ?? [new Set<string>(), {}];
  const closerLook: CloserLook[] = [];
  if (PERMISSION_LABELS.some((l) => labels.has(l)) || PERMISSION_KEYS.some((k) => k in props || k === c.key))
    closerLook.push('permission');
  if ('valid_to' in props || g.inc(type, 'SUPERSEDES').length) closerLook.push('historical');
  const label = word('proposal.type-suggestion', {
    thing: type,
    key: c.key,
    value: gqlOf(c.value) ?? '',
    count: c.instances.length,
    of,
  });
  const made = makeProposal({
    id: `type-${type}-${c.key}`.replace(/[^A-Za-z0-9_-]/g, '_'),
    graph,
    by: TYPE_SUGGESTER,
    at: at ?? null,
    read: c.instances.map((i) => `${graph}/${i}`),
    basis: basisOf(note, graph),
    changes: [{ op: 'set', thing: type, key: c.key, value: gqlOf(c.value) ?? '', group: label }],
  });
  // the step is declared as the first change, so the graph spec's check knows who proposed it
  const proposal = 'refused' in made ? made : withProposer(note, made);
  if ('refused' in proposal) return null;
  return {
    proposal,
    label,
    closerLook,
    evidence: { type, key: c.key, value: c.value, instances: c.instances, of },
  };
}

/** The note with the suggestion written after its blocks as a change set, where the review lens takes it up. */
export const withSuggestion = (note: string, s: TypeSuggestion): string =>
  `${note.replace(/\n*$/, '\n')}\n\`\`\`gql\n${changeSetText(s.proposal)}\n\`\`\`\n`;
