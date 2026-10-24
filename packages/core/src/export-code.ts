// Exporting a graph to code (editor spec §38). The graph drives a real application only through this step, in which an
// AI writes code from a snapshot. The graph itself never sends an email or calls out (export_only_way_out).
// - Before an export, its gaps are listed: what is contested, doubtful, or left out by the boundary rules. The export
//   always goes ahead once the person confirms them, and the gap list is kept with it (export_gap_summary).
// - Each export is a snapshot, frozen, named by its version and the hash of the graph it was made from. Each thing in
//   it keeps its id, so it traces back into the live graph.
// - Export is one way (export_one_way). The code side sends back a run log, kept as a log. Or it sends changes, which
//   become a proposal of low certainty for review. Nothing here writes the graph.
// - The code made is checked against the snapshot. Each mismatch joins the gap list and blocks nothing.
// - Drift, the live graph moving on from a snapshot, is found and resolved in either direction. The export lens lists
//   what has been exported.
import gs from '@thoughtknot/graph-spec';
import type { Graph, Value } from '@thoughtknot/graph-spec';
import { makeProposal, type ChangeInput, type Proposal, type Proposer } from './proposals.ts';
import { applyBoundary, type CorporateSetting } from './export-boundary.ts';

/** Why a thing is a gap in an export, as a code a host turns into words. */
export type GapKind = 'contested' | 'doubtful' | 'redacted' | 'missing-in-code' | 'extra-in-code' | 'differs-in-code';

/** One gap: what kind, which thing, and for a mismatch, which property. */
export interface Gap {
  kind: GapKind;
  thing: string;
  key?: string;
}

/** A thing as a snapshot holds it: its labels and properties. */
export interface SnapshotThing {
  labels: readonly string[];
  props: Readonly<Record<string, Value>>;
}

/** An export: a frozen snapshot of a graph, its version, when it was made and by whom, and its gaps. */
export interface ExportRecord {
  /** The export's name: its graph, its version and the first digits of its snapshot's hash. */
  id: string;
  graph: string;
  version: string;
  at: string;
  by: string;
  /** The hash of the graph's canonical text it was made from. */
  snapshot: string;
  things: Readonly<Record<string, SnapshotThing>>;
  links: readonly (readonly [string, string, string])[];
  gaps: readonly Gap[];
  /** The things marked as AI-assisted, by the corporate boundary rules. */
  aiAssisted: readonly string[];
}

/** What an export would hold, shown before it is made: the gap summary to confirm. */
export interface ExportPlan {
  graph: string;
  snapshot: string;
  gaps: Gap[];
  /** Whether there are gaps to confirm first. An export with none goes ahead at once. */
  confirm: boolean;
}

// the likelihood words below an even chance, and the one that cannot judge
const DOUBTFUL = new Set(['almost-no-chance', 'very-unlikely', 'unlikely', 'cannot-judge']);

/** The gaps of a graph: each contested thing and each doubtful one, in the graph's order. */
export function gapsOf(g: Pick<Graph, 'nodes'>): Gap[] {
  const out: Gap[] = [];
  for (const [id, [, p]] of g.nodes) {
    if (p['status'] === 'contested') out.push({ kind: 'contested', thing: id });
    else if (typeof p['likelihood'] === 'string' && DOUBTFUL.has(p['likelihood']))
      out.push({ kind: 'doubtful', thing: id });
  }
  return out;
}

/** The plan of exporting graph `name`: its gaps, the boundary rules' redactions among them when a setting is given. */
export function planExport(name: string, g: Graph, setting?: CorporateSetting): ExportPlan {
  const bounded = setting ? applyBoundary(g, setting) : null;
  const gaps = [...(bounded?.gaps ?? []), ...gapsOf(bounded?.graph ?? g)];
  return { graph: name, snapshot: gs.canon(g), gaps, confirm: gaps.length > 0 };
}

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
};

/** What a person says when they confirm an export: who, the version it is named by, and when. */
export interface ExportConfirm {
  by: string;
  version: string;
  at: string;
}

/**
 * Makes the export a plan describes, once its gaps are confirmed. It is always allowed then, whatever the gaps. Null
 * when the graph has changed since the plan was shown, so what was confirmed is what is exported.
 */
export function confirmExport(
  plan: ExportPlan,
  g: Graph,
  confirm: ExportConfirm,
  setting?: CorporateSetting,
): ExportRecord | null {
  if (gs.canon(g) !== plan.snapshot) return null;
  const bounded = setting ? applyBoundary(g, setting) : null;
  const shown = bounded?.graph ?? g;
  const things: Record<string, SnapshotThing> = {};
  for (const [id, [labels, props]] of shown.nodes) things[id] = { labels: [...labels].sort(), props: { ...props } };
  return deepFreeze({
    id: `export:${plan.graph}@${confirm.version}#${plan.snapshot.slice(0, 16)}`,
    graph: plan.graph,
    version: confirm.version,
    at: confirm.at,
    by: confirm.by,
    snapshot: plan.snapshot,
    things,
    links: shown.edges.map(([a, t, b]) => [a, t, b] as const),
    gaps: plan.gaps.map((gap) => ({ ...gap })),
    aiAssisted: bounded?.aiAssisted ?? [],
  });
}

/** The things the code was made with, as the code side reports them: each id and its properties. */
export type Generated = Record<string, Record<string, Value>>;

/**
 * The export, with what the code does not match added to its gaps. That is things missing from the code, things it
 * adds, and properties it gives otherwise. The snapshot is unchanged and nothing is refused. The record is a new one, frozen too.
 */
export function checkGenerated(record: ExportRecord, generated: Generated): ExportRecord {
  const found: Gap[] = [];
  for (const [id, thing] of Object.entries(record.things)) {
    const made = generated[id];
    if (!made) {
      found.push({ kind: 'missing-in-code', thing: id });
      continue;
    }
    for (const key of Object.keys(thing.props).sort())
      if (key !== 'id' && key in made && JSON.stringify(made[key]) !== JSON.stringify(thing.props[key]))
        found.push({ kind: 'differs-in-code', thing: id, key });
  }
  for (const id of Object.keys(generated)) if (!(id in record.things)) found.push({ kind: 'extra-in-code', thing: id });
  const seen = new Set(record.gaps.map((g) => JSON.stringify(g)));
  const gaps = [...record.gaps, ...found.filter((g) => !seen.has(JSON.stringify(g)))];
  return deepFreeze({ ...record, gaps });
}

/** What comes back from the code side: a run log, or changes it would make to the graph. */
export type FromCode =
  | { kind: 'run-log'; at: string; lines: readonly string[] }
  | { kind: 'changes'; id: string; by: Proposer; at: string; changes: ChangeInput[] };

/** What the graph takes of it: a log, kept as imported; or a proposal of low certainty, reviewed like any join. */
export type Returned =
  | { kind: 'run-log'; export: string; at: string; lines: readonly string[] }
  | { kind: 'proposal'; export: string; proposal: Proposal; likelihood: 'unlikely' }
  | { kind: 'refused'; reason: string };

/** Takes back what the code side sends. It is never written: a log is a log, and changes wait in review. */
export function fromCode(record: ExportRecord, input: FromCode): Returned {
  if (input.kind === 'run-log') return { kind: 'run-log', export: record.id, at: input.at, lines: [...input.lines] };
  const made = makeProposal({
    id: input.id,
    graph: record.graph,
    by: input.by,
    at: input.at,
    read: [record.id],
    basis: record.snapshot.slice(0, 16),
    changes: input.changes,
  });
  if ('refused' in made) return { kind: 'refused', reason: made.refused };
  return { kind: 'proposal', export: record.id, proposal: made, likelihood: 'unlikely' };
}

/** How the live graph has moved from an export: a thing added, removed, or with properties changed. */
export interface Drift {
  kind: 'added' | 'removed' | 'changed';
  thing: string;
  keys: string[];
}

/** The drift between an export and the live graph, each thing traced by its id. */
export function driftOf(record: ExportRecord, live: Pick<Graph, 'nodes'>): Drift[] {
  const out: Drift[] = [];
  for (const [id, thing] of Object.entries(record.things)) {
    const now = live.nodes.get(id);
    if (!now) {
      out.push({ kind: 'removed', thing: id, keys: [] });
      continue;
    }
    const keys = [...new Set([...Object.keys(thing.props), ...Object.keys(now[1])])]
      .filter((k) => JSON.stringify(thing.props[k]) !== JSON.stringify(now[1][k]))
      .sort();
    if (keys.length) out.push({ kind: 'changed', thing: id, keys });
  }
  for (const id of live.nodes.keys()) if (!(id in record.things)) out.push({ kind: 'added', thing: id, keys: [] });
  return out;
}

const gqlValue = (v: Value | undefined): string | null =>
  typeof v === 'string'
    ? gs.quote(v)
    : typeof v === 'number' || typeof v === 'boolean'
      ? String(v).toUpperCase()
      : null;

/**
 * The changes that resolve a drift toward the export: each changed property set back to the value the export holds.
 * They are offered as a proposal, never written. Resolving toward the graph is a new export, planned from the live
 * graph as any other is.
 */
export function backToExport(record: ExportRecord, drift: readonly Drift[]): ChangeInput[] {
  const out: ChangeInput[] = [];
  for (const d of drift) {
    if (d.kind !== 'changed') continue;
    for (const key of d.keys) {
      const value = gqlValue(record.things[d.thing]?.props[key]);
      if (key !== 'id' && value !== null) out.push({ op: 'set', thing: d.thing, key, value });
    }
  }
  return out;
}

/** One row of the export lens: an export, its version, when, by whom, how many things and gaps it holds. */
export interface ExportRow {
  id: string;
  graph: string;
  version: string;
  at: string;
  by: string;
  things: number;
  gaps: number;
}

/** The export lens: every export made, newest first. */
export function exportsLens(records: readonly ExportRecord[]): ExportRow[] {
  return records
    .map((r) => ({
      id: r.id,
      graph: r.graph,
      version: r.version,
      at: r.at,
      by: r.by,
      things: Object.keys(r.things).length,
      gaps: r.gaps.length,
    }))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
