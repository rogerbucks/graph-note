// Scoring the writes an AI or an outside source proposes (editor spec §37). The score only orders and groups the review
// queue. No such write applies until a person accepts it (ai_write_scoring).
// - The score, out of 100 with the safest highest, weighs six things. These are the write's size and the certainty of
//   what it touches. They are also whether it adds or removes, and whether it touches contested things. The last two
//   are the intent checks it fails and its source's record of rejected writes.
// - A write touching a permission-bearing type or a historical item is marked for a closer look, whatever its score.
// - The weights are graph data the owner sets by hand: a `ScoringPolicy` thing. What it leaves out keeps its default.
// - A write from a third party or another outside source always waits in review, whatever its score
//   (external_writes_reviewed).
// - An accepted write is a labelled bundle. It shows in the review lens, and it rolls back in one step
//   (auto_writes_roll_back).
import type { Graph, Value } from '@thoughtknot/graph-spec';
import { applyChange } from './proposals-apply.ts';
import type { Proposal, ProposedChange } from './proposals.ts';

/** Where a write comes from: an AI the person uses, or a third party or other outside source. */
export type WriteSource = { kind: 'ai' | 'external'; name: string };

/** A write waiting for review: the proposal, where it came from, and the intent checks it failed, by name. */
export interface ProposedWrite {
  proposal: Proposal;
  source: WriteSource;
  failedIntents?: readonly string[];
}

/** How much each part counts, in points off 100. The owner sets them in a `ScoringPolicy` thing. */
export interface ScoringPolicy {
  per_change: number;
  per_removal: number;
  per_doubtful: number;
  per_contested: number;
  per_failed_intent: number;
  per_rejection_share: number;
}

/** The weights a graph gives no `ScoringPolicy` for. */
export const DEFAULT_POLICY: Readonly<ScoringPolicy> = Object.freeze({
  per_change: 2,
  per_removal: 10,
  per_doubtful: 5,
  per_contested: 15,
  per_failed_intent: 20,
  per_rejection_share: 30,
});

/** The types whose things carry permissions: a change to one is always looked at closely. */
export const PERMISSION_TYPES: readonly string[] = ['Role', 'Person', 'GrantRule', 'Grant', 'ScoringPolicy'];
const PERMISSION_LINKS = new Set(['HAS_ROLE', 'HAS_RULE', 'HOLDS', 'FROM_RULE']);

/** The policy a graph sets by hand, each weight it leaves out at its default. A weight below zero is not taken. */
export function policyOf(g: Pick<Graph, 'nodes'> | null): ScoringPolicy {
  const policy = { ...DEFAULT_POLICY };
  const found = g ? [...g.nodes.values()].find(([labels]) => labels.has('ScoringPolicy')) : undefined;
  if (found)
    for (const key of Object.keys(policy) as (keyof ScoringPolicy)[]) {
      const v: Value | undefined = found[1][key];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) policy[key] = v;
    }
  return policy;
}

/** A source's record: how many of its writes were accepted and how many rejected. */
export type Records = Readonly<Record<string, { accepted: number; rejected: number }>>;

/** A write in the queue: its score, its group, whether it is marked for a closer look, and its state. */
export interface QueuedWrite {
  write: ProposedWrite;
  score: number;
  /** The group it is reviewed in: outside writes on their own, then by score. */
  group: 'external' | 'safer' | 'check' | 'risky';
  closerLook: boolean;
  /** What the score took off, by part, so a person sees why. */
  parts: Record<keyof ScoringPolicy, number>;
  state: 'waiting';
}

const DOUBTFUL = new Set(['almost-no-chance', 'very-unlikely', 'unlikely', 'even-chance', 'cannot-judge']);

/** The things a change touches, by id. */
const touched = (c: ProposedChange): string[] =>
  c.op === 'set' || c.op === 'remove-thing' ? [c.thing] : c.op === 'remove-link' ? [c.from, c.to] : [];

/** The labels and link types a change names, as far as its own text says. */
const named = (c: ProposedChange): string[] =>
  c.op === 'add'
    ? [...c.gql.matchAll(/:\s*([A-Za-z_]\w*)/g)].map((m) => m[1] ?? '')
    : c.op === 'remove-link'
      ? [c.type, ...(c.ends ?? []).flat()]
      : [...(c.labels ?? [])];

/** Whether a change reaches a permission-bearing type or a historical item, in the graph as it is. */
function needsCloserLook(c: ProposedChange, g: Pick<Graph, 'nodes'>): boolean {
  if (named(c).some((n) => PERMISSION_TYPES.includes(n) || PERMISSION_LINKS.has(n))) return true;
  return touched(c).some((id) => {
    const node = g.nodes.get(id);
    if (!node) return false;
    const [labels, p] = node;
    return PERMISSION_TYPES.some((t) => labels.has(t)) || p['historical'] === true || labels.has('Revision');
  });
}

/** Scores one write against the graph it would change, under `policy` and its source's record. */
export function scoreWrite(
  write: ProposedWrite,
  g: Pick<Graph, 'nodes'>,
  policy: ScoringPolicy = DEFAULT_POLICY,
  records: Records = {},
): QueuedWrite {
  const changes = write.proposal.changes;
  const ids = [...new Set(changes.flatMap(touched))];
  const props = ids.map((id) => g.nodes.get(id)?.[1]).filter((p): p is Record<string, Value> => !!p);
  const record = records[write.source.name];
  const share =
    record && record.accepted + record.rejected > 0 ? record.rejected / (record.accepted + record.rejected) : 0;
  const parts: Record<keyof ScoringPolicy, number> = {
    per_change: policy.per_change * changes.length,
    per_removal: policy.per_removal * changes.filter((c) => c.op !== 'add' && c.op !== 'set').length,
    per_doubtful:
      policy.per_doubtful *
      props.filter((p) => typeof p['likelihood'] === 'string' && DOUBTFUL.has(p['likelihood'])).length,
    per_contested: policy.per_contested * props.filter((p) => p['status'] === 'contested').length,
    per_failed_intent: policy.per_failed_intent * (write.failedIntents?.length ?? 0),
    per_rejection_share: Math.round(policy.per_rejection_share * share),
  };
  const score = Math.max(0, 100 - Object.values(parts).reduce((a, b) => a + b, 0));
  const group = write.source.kind === 'external' ? 'external' : score >= 80 ? 'safer' : score >= 50 ? 'check' : 'risky';
  return { write, score, group, closerLook: changes.some((c) => needsCloserLook(c, g)), parts, state: 'waiting' };
}

const GROUPS = ['external', 'safer', 'check', 'risky'] as const;

/** The review queue: every write waiting, grouped (outside writes first), and by score within a group, safest first. */
export function reviewQueue(
  writes: readonly ProposedWrite[],
  g: Pick<Graph, 'nodes'>,
  policy: ScoringPolicy = DEFAULT_POLICY,
  records: Records = {},
): QueuedWrite[] {
  return writes
    .map((w) => scoreWrite(w, g, policy, records))
    .sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || b.score - a.score);
}

/** A write a person accepted: labelled, with who accepted it and when, and the texts before and after it. */
export interface WriteBundle {
  /** Its label: where it came from and the proposal's id. */
  label: string;
  source: WriteSource;
  proposal: string;
  acceptedBy: string;
  at: string;
  graph: string;
  changes: readonly string[];
  before: readonly string[];
  after: readonly string[];
}

/**
 * Writes an accepted write into the graph's block texts, as one bundle. It needs the name of the person accepting,
 * and every change goes in or none does.
 */
export function acceptWrite(
  queued: QueuedWrite,
  texts: readonly string[],
  person: string,
  at: string,
): { ok: true; bundle: WriteBundle } | { ok: false; reason: string } {
  if (!person.trim()) return { ok: false, reason: 'person-must-accept' };
  const { proposal, source } = queued.write;
  let now: string[] = [...texts];
  for (const c of proposal.changes) {
    const done = applyChange(now, proposal.graph, c);
    if (!done.ok) return { ok: false, reason: done.reason };
    now = done.texts;
  }
  const bundle: WriteBundle = Object.freeze({
    label: `${source.kind}-write:${source.name}/${proposal.id}`,
    source,
    proposal: proposal.id,
    acceptedBy: person,
    at,
    graph: proposal.graph,
    changes: Object.freeze(proposal.changes.map((c) => c.id)),
    before: Object.freeze([...texts]),
    after: Object.freeze(now),
  });
  return { ok: true, bundle };
}

/** Rolls a bundle back in one step: the texts as they were, while nothing has been written after it. */
export function rollBack(
  bundle: WriteBundle,
  texts: readonly string[],
): { ok: true; texts: string[] } | { ok: false; reason: 'moved-since' } {
  if (texts.length !== bundle.after.length || texts.some((t, i) => t !== bundle.after[i]))
    return { ok: false, reason: 'moved-since' };
  return { ok: true, texts: [...bundle.before] };
}

/** One row of the review lens: an accepted bundle, its label, who accepted it, when, and how many changes. */
export interface BundleRow {
  label: string;
  acceptedBy: string;
  at: string;
  changes: number;
}

/** The review lens of accepted writes, newest first. */
export function acceptedLens(bundles: readonly WriteBundle[]): BundleRow[] {
  return bundles
    .map((b) => ({ label: b.label, acceptedBy: b.acceptedBy, at: b.at, changes: b.changes.length }))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
