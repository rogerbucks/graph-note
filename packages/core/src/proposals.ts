// Proposals (editor spec §17, AI proposals — accepted or rejected in the editor). A proposal is a set of changes to a
// graph that somebody other than the person reading proposes. That may be an AI's answer (§19), a graph step's output
// (§20), or anyone. It is plain data the editor can show over the graph and read back in plain language. A person
// decides on it one change at a time. A proposal never writes anything: `proposals-review.ts` shows it and, when a
// person accepts, writes the change as an ordinary edit. This module is the data. It holds who proposed it, when, what
// it read and the state of the graph it was made against (`provenance`). It also holds its changes in groups, each an
// addition, a change of a property or a removal.
import { blankText, items } from './block-items.ts';
import { readNote } from './drawing.ts';
import { hops } from './estimates.ts';
import { saidDate } from './export-frame.ts';
import { parseValue } from './inspector.ts';
import { changeIdOf } from './proposals-statements.ts';
import { writtenIn } from './written-things.ts';
import { word } from './words.ts';

/** More changes than this are reviewed in groups (big_proposal): fewer are listed in one. */
export const BIG_PROPOSAL = 8;

/** What proposed a change: an AI model, a person, a graph step, or a source that did not say. */
export type ProposerKind = 'model' | 'person' | 'step' | 'unknown';

/** Who proposed it: one word (a change set's header holds it so), and what kind of proposer it is. */
export interface Proposer {
  name: string;
  kind: ProposerKind;
}

/** What a proposal shows of where it came from (proposal_provenance). */
export interface Provenance {
  by: Proposer;
  /** When it was proposed (an ISO day, or day and time), or null when the source did not say. */
  at: string | null;
  /** What it read, as the source names it (notes, graphs, things); none when the source did not say. */
  read: string[];
  /** The state of the graph it was made against: `basisOf`'s sixteen hexadecimal digits, as a change set's `against`. */
  basis: string;
}

/**
 * The change itself. An addition is one item of GQL as a block writes it (a thing, or a link or a path). A set changes
 * one property of a thing already there (`value` as GQL writes it). A removal names the thing, or the link, to take
 * out.
 */
export type ChangeOp =
  | { op: 'add'; gql: string }
  | { op: 'set'; thing: string; key: string; value: string; labels?: string[] }
  | { op: 'remove-thing'; thing: string; detach?: false; labels?: string[] }
  | { op: 'remove-link'; from: string; type: string; to: string; ends?: [string[], string[]] };
// `detach: false` is a plain DELETE. That leaves no link without its end, and so is refused for a thing that has links.
// Without it a removal of a thing is a DETACH DELETE. `labels` and `ends` are the kinds the statement's MATCH names,
// which the target must have. A change a source builds names none.

/** A change as a source offers it. The proposal gives its group when the source leaves it out; it never has an id. */
export type ChangeInput = ChangeOp & { group?: string; reason?: string };

/**
 * A change in a proposal: its id, the group it is reviewed in and, if the source gave one, its reason. The id is
 * derived from its statement, so the same change has the same id wherever it is read and nobody writes one.
 */
export type ProposedChange = ChangeOp & { id: string; group: string; reason?: string };

/** A proposal: changes to one graph, and where they came from. */
export interface Proposal {
  /** One word: the change set's id. */
  id: string;
  graph: string;
  provenance: Provenance;
  changes: ProposedChange[];
}

const WORD = /^[A-Za-z_]\w*$/;
const ID = /^[A-Za-z0-9_-]+$/;
const BASIS = /^[0-9a-f]{16}$/;
const oneLine = (s: string) => !/[\n\r]/.test(s);

/** The kind a written thing has: the first of its labels. */
const kindOf = (gql: string): string | undefined =>
  writtenIn(gql).find((w) => w.writes && !w.matched && w.labels.length)?.labels[0];

/** The group a change is reviewed in when its source names none: by what it adds, changes or removes. */
export function groupOf(c: ChangeOp): string {
  if (c.op === 'set') return `Changed ${c.key}`;
  if (c.op === 'remove-thing') return 'Removed things';
  if (c.op === 'remove-link') return `Removed ${c.type} links`;
  const kind = kindOf(c.gql);
  if (kind) return `New ${kind}`;
  const link = hops(c.gql)[0];
  return link ? `New ${link[1]} links` : 'Additions';
}

/**
 * Whether a value is one value: written as `(v:T {k: VALUE})` it reads as exactly one thing with exactly one property,
 * `k`, and nothing wrong. A value that carries more is not one, whatever it is dressed as. More means another property,
 * another thing or a stray bracket. So a change of a property can write no more than it shows.
 */
function isOneValue(value: string): boolean {
  const r = readNote([`// graph: v\n(v:T {k: ${value}})`]);
  const g = r.world.v;
  if (!g || r.tooLarge || r.problems.some((p) => p.severity !== 'hint')) return false;
  return g.nodes.size === 1 && g.edges.length === 0 && Object.keys(g.p('v')).sort().join() === 'id,k';
}

/** Why one change cannot be part of a proposal, or null. */
function faultIn(c: ChangeInput, n: number): string | null {
  const change = String(n);
  if (c.op === 'add') {
    const found = items(c.gql);
    const keyword = /^[A-Za-z]+/.exec(blankText(c.gql).trim())?.[0].toUpperCase();
    if (found.length !== 1 || keyword === 'SET' || keyword === 'MATCH' || keyword === 'INSERT' || !c.gql.includes('('))
      return word('proposing.fault.addition-one', { change });
    // a line break outside a text would let the addition write a line of its own into the change set
    const item = found[0];
    if (item && /[\r\n]/.test(blankText(c.gql.slice(item.from, item.to))))
      return word('proposing.fault.addition-line', { change });
  } else if (c.op === 'set') {
    if (!WORD.test(c.thing) || !WORD.test(c.key) || c.key === 'id')
      return word('proposing.fault.set-names', { change });
    if (!c.value.trim() || !oneLine(c.value)) return word('proposing.fault.set-value', { change });
    if (!isOneValue(c.value)) return word('proposing.fault.set-one-value', { change, value: c.value });
  } else if (c.op === 'remove-thing') {
    if (!WORD.test(c.thing)) return word('proposing.fault.removal-names', { change });
  } else if (![c.from, c.type, c.to].every((w) => WORD.test(w))) {
    return word('proposing.fault.link-removal-names', { change });
  }
  const kinds = c.op === 'remove-link' ? (c.ends ?? []).flat() : c.op === 'add' ? [] : (c.labels ?? []);
  if (!kinds.every((k) => WORD.test(k))) return word('proposing.fault.kind-word', { change });
  if (c.group !== undefined && (!c.group.trim() || !oneLine(c.group)))
    return word('proposing.fault.group-line', { change });
  if (c.reason !== undefined && !oneLine(c.reason)) return word('proposing.fault.reason-line', { change });
  return null;
}

/** The change with only its own parts, in a fixed order of keys: what two sources write the same way is the same change. */
function opOf(c: ChangeOp): ChangeOp {
  if (c.op === 'add') return { op: 'add', gql: c.gql };
  const some = (l?: string[]) => (l?.length ? l : null);
  if (c.op === 'set') {
    const labels = some(c.labels);
    return { op: 'set', thing: c.thing, key: c.key, value: c.value, ...(labels ? { labels } : {}) };
  }
  if (c.op === 'remove-thing') {
    const labels = some(c.labels);
    return {
      op: 'remove-thing',
      thing: c.thing,
      ...(c.detach === false ? { detach: false as const } : {}),
      ...(labels ? { labels } : {}),
    };
  }
  const ends = c.ends && (c.ends[0].length || c.ends[1].length) ? c.ends : null;
  return { op: 'remove-link', from: c.from, type: c.type, to: c.to, ...(ends ? { ends } : {}) };
}

/** What a proposal is made from: where it came from, and the changes. */
export interface ProposalInput {
  id: string;
  graph: string;
  by: Proposer;
  at?: string | null;
  read?: readonly string[];
  basis: string;
  changes: readonly ChangeInput[];
}

/**
 * A proposal, checked; or the reason it is refused. It must say who proposed it and the state of the graph it was made
 * against. It must hold at least one change, and each change must be written the way a block writes it. The changes are
 * given the ids `c1`… and the groups their source left out.
 */
export function makeProposal(input: ProposalInput): Proposal | { refused: string } {
  const { id, graph, by, basis } = input;
  if (!id || !ID.test(id)) return { refused: word('proposing.refused.id') };
  if (!graph || /\s/.test(graph)) return { refused: word('proposing.refused.graph') };
  if (!by?.name || /\s/.test(by.name)) return { refused: word('proposing.refused.by') };
  if (!BASIS.test(basis ?? '')) return { refused: word('proposing.refused.basis') };
  if (input.at != null && !/^\d{4}-\d\d-\d\d/.test(input.at)) return { refused: word('proposing.refused.day') };
  if (!input.changes.length) return { refused: word('proposing.refused.no-change') };
  const faults = input.changes.map((c, i) => faultIn(c, i + 1));
  const fault = faults.find((f) => f !== null);
  if (fault) return { refused: fault };
  const changes = input.changes.map((c): ProposedChange => {
    const { group, reason } = c;
    // the change itself, in one order of keys, whatever order its source wrote them in. An addition is kept as the item
    // itself: what a comment or a comma around it said is not part of the change
    const item = c.op === 'add' ? items(c.gql)[0] : undefined;
    const op = opOf(c.op === 'add' && item ? { op: 'add', gql: c.gql.slice(item.from, item.to) } : c);
    return { ...op, id: changeIdOf(op), group: group?.trim() || groupOf(op), ...(reason ? { reason } : {}) };
  });
  // the same change twice would be accepted or rejected as two, though it is one
  if (new Set(changes.map((c) => c.id)).size !== changes.length) return { refused: word('proposing.refused.twice') };
  // what it read is kept on one line, parted by semicolons: a semicolon in a name is a comma there
  const read = (input.read ?? [])
    .map((r) =>
      r
        .replace(/;/g, ',')
        .replace(/[\n\r]+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
  return {
    id,
    graph,
    provenance: { by: { name: by.name, kind: by.kind ?? 'unknown' }, at: input.at ?? null, read, basis },
    changes,
  };
}

/** A value as GQL writes it: a text quoted, a number or true or false as it is. */
export function valueGql(value: string | number | boolean): string {
  if (typeof value === 'string') return (parseValue('text', value) as { gql: string }).gql;
  return String(value);
}

/** An addition of a thing, from its parts: `(name:Kind {key: value, …})`. */
export function thingChange(
  name: string,
  kind: string,
  properties: Record<string, string | number | boolean> = {},
  extra: { group?: string; reason?: string } = {},
): ChangeInput {
  const map = Object.entries(properties).map(([k, v]) => `${k}: ${valueGql(v)}`);
  return { op: 'add', gql: `(${name}:${kind}${map.length ? ` {${map.join(', ')}}` : ''})`, ...extra };
}

/** An addition of a link, from its parts: `(from)-[:TYPE {key: value, …}]->(to)`. */
export function linkChange(
  from: string,
  type: string,
  to: string,
  properties: Record<string, string | number | boolean> = {},
  extra: { group?: string; reason?: string } = {},
): ChangeInput {
  const map = Object.entries(properties).map(([k, v]) => `${k}: ${valueGql(v)}`);
  return { op: 'add', gql: `(${from})-[:${type}${map.length ? ` {${map.join(', ')}}` : ''}]->(${to})`, ...extra };
}

/** The sentences that say where a proposal came from: who, when and what it read; what is not known is said so. */
export function provenanceLines(p: Proposal): string[] {
  const { by, at, read } = p.provenance;
  // what the change set says, never as if the editor had checked it: who proposed it, when and what it read are its word
  const said = /^(\d{4}-\d\d-\d\d)(?:T(\d\d:\d\d))?/.exec(at ?? '');
  const day = saidDate(said?.[1] ?? ''),
    time = said?.[2] ?? '';
  const utc = /(Z|[+-]00:?00)$/.test(at ?? '');
  const when = !said
    ? word('proposing.said-on.none')
    : !time
      ? word('proposing.said-on', { day })
      : word(utc ? 'proposing.said-on.utc' : 'proposing.said-on.time', { day, time });
  return [
    word(`proposing.said-by.${by.kind}`, { name: by.name }),
    when,
    read.length ? word('proposing.said-read', { read: read.join('; ') }) : word('proposing.said-read.none'),
  ];
}

/** One group of a proposal's changes, and how far it has been decided. */
export interface ChangeGroup {
  name: string;
  ids: string[];
  pending: number;
  accepted: number;
  rejected: number;
}

/** The proposal's groups in the order their first change comes, each with its changes and how many wait, are accepted or rejected. */
export function groupsOf(p: Proposal, stateOf: (id: string) => 'pending' | 'accepted' | 'rejected'): ChangeGroup[] {
  const out = new Map<string, ChangeGroup>();
  for (const c of p.changes) {
    const g = out.get(c.group) ?? { name: c.group, ids: [], pending: 0, accepted: 0, rejected: 0 };
    g.ids.push(c.id);
    g[stateOf(c.id)]++;
    out.set(c.group, g);
  }
  return [...out.values()];
}
