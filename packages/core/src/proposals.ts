// Proposals (editor spec §17, AI proposals — accepted or rejected in the editor): a set of changes to a graph that
// somebody other than the person reading proposes — an AI's answer (§19), a graph step's output (§20), or anyone — as
// plain data the editor can show over the graph, read back in plain English and have a person decide, one change at a
// time. A proposal never writes anything: `proposals-review.ts` shows it and, when a person accepts, writes the change
// as an ordinary edit. This module is the data: who proposed it, when, what it read and the state of the graph it was
// made against (`provenance`), and its changes — each an addition, a change of a property or a removal — in groups.
import { blankText, items } from './block-items.ts';
import { readNote } from './drawing.ts';
import { hops } from './estimates.ts';
import { saidDate } from './export-frame.ts';
import { parseValue } from './inspector.ts';
import { writtenIn } from './written-things.ts';

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
 * The change itself. An addition is one item of GQL as a block writes it (a thing, or a link or a path); a set changes
 * one property of a thing already there (`value` as GQL writes it); a removal names the thing, or the link, to take out.
 */
export type ChangeOp =
  | { op: 'add'; gql: string }
  | { op: 'set'; thing: string; key: string; value: string }
  | { op: 'remove-thing'; thing: string }
  | { op: 'remove-link'; from: string; type: string; to: string };

/** A change as a source offers it: its id and group are given by the proposal when the source leaves them out. */
export type ChangeInput = ChangeOp & { id?: string; group?: string; reason?: string };

/** A change in a proposal: its id (`c1`…, kept for good), the group it is reviewed in and, if the source gave one, its reason. */
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
 * `k`, and nothing wrong. A value that carries more — another property, another thing, a stray bracket — is not one,
 * whatever it is dressed as, so a change of a property can write no more than it shows.
 */
function isOneValue(value: string): boolean {
  const r = readNote([`// graph: v\n(v:T {k: ${value}})`]);
  const g = r.world.v;
  if (!g || r.tooLarge || r.problems.some((p) => p.severity !== 'hint')) return false;
  return g.nodes.size === 1 && g.edges.length === 0 && Object.keys(g.p('v')).sort().join() === 'id,k';
}

/** Why one change cannot be part of a proposal, or null. */
function faultIn(c: ChangeInput, n: number): string | null {
  const at = `change ${n}`;
  if (c.op === 'add') {
    const found = items(c.gql);
    const word = /^[A-Za-z]+/.exec(blankText(c.gql).trim())?.[0].toUpperCase();
    if (found.length !== 1 || word === 'SET' || word === 'MATCH' || word === 'INSERT' || !c.gql.includes('('))
      return `${at}: an addition is one thing, or one link or path, as a block writes it; write each as its own change`;
  } else if (c.op === 'set') {
    if (!WORD.test(c.thing) || !WORD.test(c.key) || c.key === 'id')
      return `${at}: a change of a property names a thing and a property (not its id), each one word`;
    if (!c.value.trim() || !oneLine(c.value)) return `${at}: a change of a property gives its value, on one line`;
    if (!isOneValue(c.value))
      return `${at}: a change of a property gives one value, and nothing else: ${c.value} reads as more, or as something wrong`;
  } else if (c.op === 'remove-thing') {
    if (!WORD.test(c.thing)) return `${at}: a removal names the thing, one word`;
  } else if (![c.from, c.type, c.to].every((w) => WORD.test(w))) {
    return `${at}: a removal of a link names where it is from, its type and where it goes to, each one word`;
  }
  if (c.group !== undefined && (!c.group.trim() || !oneLine(c.group))) return `${at}: a group is named on one line`;
  if (c.reason !== undefined && !oneLine(c.reason)) return `${at}: a reason is given on one line`;
  if (c.id !== undefined && !ID.test(c.id)) return `${at}: an id is letters, digits, hyphens and underscores`;
  return null;
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
 * A proposal, checked: it must say who proposed it and the state of the graph it was made against, hold at least one
 * change, and each change must be written the way a block writes it. The changes are given the ids `c1`… and the groups
 * their source left out; or the reason it is refused.
 */
export function makeProposal(input: ProposalInput): Proposal | { refused: string } {
  const { id, graph, by, basis } = input;
  if (!id || !ID.test(id)) return { refused: 'a proposal has an id of one word' };
  if (!graph || /\s/.test(graph)) return { refused: 'a proposal names the graph it is for, one word' };
  if (!by?.name || /\s/.test(by.name))
    return { refused: 'say who proposed it: a name of one word, as a change set’s header holds it' };
  if (!BASIS.test(basis ?? ''))
    return {
      refused: 'say which state of the graph it was made against: sixteen hexadecimal digits (basisOf gives them)',
    };
  if (input.at != null && !/^\d{4}-\d\d-\d\d/.test(input.at))
    return { refused: 'say when it was proposed as a day, YYYY-MM-DD, with the time if known' };
  if (!input.changes.length) return { refused: 'a proposal holds at least one change' };
  const faults = input.changes.map((c, i) => faultIn(c, i + 1));
  const fault = faults.find((f) => f !== null);
  if (fault) return { refused: fault };
  const given = input.changes.flatMap((c) => (c.id === undefined ? [] : [c.id]));
  if (new Set(given).size !== given.length) return { refused: 'two changes have the same id' };
  const used = new Set(given);
  let next = 1;
  const changes = input.changes.map((c): ProposedChange => {
    let cid = c.id;
    if (cid === undefined) {
      while (used.has(`c${next}`)) next++;
      cid = `c${next++}`;
      used.add(cid);
    }
    const { group, reason, id: _given, ...rest } = c;
    // an addition is kept as the item itself: what a comment or a comma around it said is not part of the change
    const item = rest.op === 'add' ? items(rest.gql)[0] : undefined;
    const op: ChangeOp = rest.op === 'add' && item ? { op: 'add', gql: rest.gql.slice(item.from, item.to) } : rest;
    return { ...op, id: cid, group: group?.trim() || groupOf(op), ...(reason ? { reason } : {}) };
  });
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
  const who = {
    model: ', a model',
    person: ', a person',
    step: ', a graph step',
    unknown: ', of a kind it does not say',
  }[by.kind];
  const day = /^(\d{4}-\d\d-\d\d)(?:T(\d\d:\d\d))?/.exec(at ?? '');
  const when = day
    ? `It says it was proposed on ${saidDate(day[1] ?? '')}${day[2] ? `, ${day[2]}${/(Z|[+-]00:?00)$/.test(at ?? '') ? ' UTC' : ''}` : ''}.`
    : 'It does not say when it was proposed.';
  return [
    `The change set says it was proposed by ${by.name}${who}.`,
    when,
    read.length ? `It says it read: ${read.join('; ')}.` : 'It does not say what it read.',
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
