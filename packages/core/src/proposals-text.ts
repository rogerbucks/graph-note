// A proposal as text (editor spec §17): graph-spec's change set (§24 H1) — a block whose first line is
// `// graph: G · CHANGE SET id · against <state> · by <author>`, then the things and links it adds and the SET lines that
// change a property — with what graph-spec's change set has no line for written beside it as comments, which its readers
// pass over: who proposed it and what it read, the removals, each change's id and group, and the decisions a person made
// (rejecting_recorded). So the change set in the note is the record: read again, it gives back the proposal and what has
// been decided, and graph-spec's own check still reads it as the change set it was.
//
//   // graph: reader · CHANGE SET cs1 · against 05d75fdcbdb1d37b · by ada
//   // proposer kind: model
//   // proposed: 2026-10-13T09:00:00Z
//   // read: reader; Notes/Devices
//   // basis now: 05d75fdcbdb1d37b          (only once a change has been accepted: the graph's state the accepts left)
//   //@ change: c1
//   //@ group: New Option
//   //@ rejected: roger, 2026-10-13T10:30:00Z
//   /// why it is proposed, if the source said
//   (small_reader:Option {name: 'Small reader'}),
//   ...
//   SET large_reader.price = 4
//
//   //@ change: c5
//   //@ group: Removed things
//   //@ remove: thing alice
import gs from '@graph-note/graph-spec';
import { blankText, items, lineIndex } from './block-items.ts';
import { makeProposal } from './proposals.ts';
import type { ChangeInput, Proposal, ProposerKind } from './proposals.ts';

/** What a person decided about a change: accepted or rejected, who decided and when. */
export interface Decision {
  state: 'accepted' | 'rejected';
  by: string;
  at: string;
}

/** A change set read back: the proposal, the decisions recorded in it, and the graph's state after the accepts it records. */
export interface ChangeSetRead {
  proposal: Proposal;
  decisions: Map<string, Decision>;
  basisNow: string | null;
}

/** The graph and the id a change set's first line names; null for a block that is not a change set. */
export function changeSetId(block: string): { graph: string; id: string } | null {
  const h = gs.changesetHeader(block);
  return h ? { graph: h.graph, id: h.id } : null;
}

/** A name or a time as a decision's line holds it: no space or comma in it. */
export const oneWord = (s: string): string => s.replace(/[\s,]+/g, '_');

const KINDS = new Set<string>(['model', 'person', 'step', 'unknown']);

/**
 * The change set for a proposal: graph-spec's lines for what it adds and sets, the removals after them, and each
 * change's id, group, reason and decision above it. `basisNow` is the graph's state after the changes accepted so far.
 */
export function changeSetText(p: Proposal, decisions: ReadonlyMap<string, Decision>, basisNow: string | null): string {
  const { by, at, read, basis } = p.provenance;
  const out = [
    `// graph: ${p.graph} · CHANGE SET ${p.id} · against ${basis} · by ${by.name}`,
    `// proposer kind: ${by.kind}`,
    ...(at ? [`// proposed: ${at}`] : []),
    ...(read.length ? [`// read: ${read.join('; ')}`] : []),
    ...(basisNow ? [`// basis now: ${basisNow}`] : []),
  ];
  const tags = (c: Proposal['changes'][number]): string[] => {
    const d = decisions.get(c.id);
    return [
      `//@ change: ${c.id}`,
      `//@ group: ${c.group}`,
      ...(d ? [`//@ ${d.state}: ${oneWord(d.by)}, ${oneWord(d.at)}`] : []),
      ...(c.reason ? [`/// ${c.reason}`] : []),
    ];
  };
  const written = [...p.changes.filter((c) => c.op === 'add'), ...p.changes.filter((c) => c.op === 'set')];
  let first = true;
  written.forEach((c, i) => {
    out.push(...tags(c));
    const text =
      c.op === 'add' ? c.gql : c.op === 'set' ? `${first ? 'SET ' : ''}${c.thing}.${c.key} = ${c.value}` : '';
    if (c.op === 'set') first = false;
    out.push(`${text}${i < written.length - 1 ? ',' : ''}`);
  });
  for (const c of p.changes) {
    if (c.op !== 'remove-thing' && c.op !== 'remove-link') continue;
    out.push('', ...tags(c));
    out.push(c.op === 'remove-thing' ? `//@ remove: thing ${c.thing}` : `//@ remove: link ${c.from} ${c.type} ${c.to}`);
  }
  return out.join('\n');
}

const TAG = /^\s*\/\/@ ([A-Za-z_][\w.-]*):\s*(.*?)\s*$/;
const NOTE = /^\s*\/\/\/ ?(.*?)\s*$/;
const ASSIGN = /^(?:SET\s+)?([A-Za-z_]\w*)\s*\.\s*([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/;
const REMOVE = /^(thing|link) (.+)$/;

/** The comment lines directly above a line, nearest last: a change's tags and its reason. */
function runAbove(lines: readonly string[], line: number): string[] {
  const run: string[] = [];
  for (let i = line - 1; i >= 0 && /^\s*\/\/[@/]/.test(lines[i] ?? ''); i--) run.unshift(lines[i] ?? '');
  return run;
}

/**
 * A change set read back into the proposal it holds, the decisions recorded in it and the graph's state after the accepts
 * they record; or why it cannot be. A change set written by something else — plain GQL with no comments of ours — is read
 * too: each thing, link and SET line is a change, numbered in order, and its proposer is of a kind not stated.
 */
export function readChangeSet(block: string): ChangeSetRead | { refused: string } {
  const h = gs.changesetHeader(block);
  if (!h)
    return {
      refused:
        'this is not a change set: its first line reads `// graph: <graph> · CHANGE SET <id> · against <state> · by <author>`',
    };
  const lines = block.split('\n');
  const meta = (re: RegExp) => lines.map((l) => re.exec(l)?.[1]).find((m) => m !== undefined);
  const kind = meta(/^\/\/ proposer kind: (\w+)\s*$/) ?? 'unknown';
  const read = (meta(/^\/\/ read: (.*?)\s*$/) ?? '')
    .split(';')
    .map((r) => r.trim())
    .filter(Boolean);
  const basisNow = meta(/^\/\/ basis now: ([0-9a-f]{16})\s*$/) ?? null;
  const found: { line: number; change: ChangeInput }[] = [];
  const decisions = new Map<string, Decision>();
  // the decision of a change with no id tag of its own, until the proposal numbers it
  const unnumbered = new Map<ChangeInput, Decision>();
  const hold = (line: number, change: ChangeInput, run: string[]) => {
    const tag = (key: string) => run.map((r) => TAG.exec(r)).find((m) => m?.[1] === key)?.[2];
    const reason = run
      .map((r) => NOTE.exec(r)?.[1])
      .filter((n) => n)
      .join(' ');
    const id = tag('change'),
      group = tag('group');
    const held = { ...change, ...(id ? { id } : {}), ...(group ? { group } : {}), ...(reason ? { reason } : {}) };
    for (const state of ['accepted', 'rejected'] as const) {
      const d = /^(\S+), (\S+)$/.exec(tag(state) ?? '');
      if (!d) continue;
      const decision = { state, by: d[1] ?? '', at: d[2] ?? '' };
      if (id) decisions.set(id, decision);
      else unnumbered.set(held, decision);
    }
    found.push({ line, change: held });
  };
  const lineOf = lineIndex(block);
  let setting = false;
  for (const it of items(block)) {
    const text = block.slice(it.from, it.to);
    const word = /^[A-Za-z]+/.exec(blankText(text).trim())?.[0].toUpperCase();
    if (word === 'SET') setting = true;
    const line = lineOf(it.from) - 1;
    const set = setting ? ASSIGN.exec(text) : null;
    const change: ChangeInput = set
      ? { op: 'set', thing: set[1] ?? '', key: set[2] ?? '', value: (set[3] ?? '').trim() }
      : { op: 'add', gql: text };
    hold(line, change, runAbove(lines, line));
  }
  lines.forEach((l, line) => {
    const r = /^\s*\/\/@ remove: (.+?)\s*$/.exec(l);
    const m = r?.[1] ? REMOVE.exec(r[1]) : null;
    if (!m) return;
    const words = (m[2] ?? '').split(/\s+/);
    const change: ChangeInput =
      m[1] === 'thing'
        ? { op: 'remove-thing', thing: words[0] ?? '' }
        : { op: 'remove-link', from: words[0] ?? '', type: words[1] ?? '', to: words[2] ?? '' };
    hold(line, change, runAbove(lines, line));
  });
  found.sort((a, b) => a.line - b.line);
  const proposal = makeProposal({
    id: h.id,
    graph: h.graph,
    by: { name: h.by, kind: (KINDS.has(kind) ? kind : 'unknown') as ProposerKind },
    at: meta(/^\/\/ proposed: (\S+)\s*$/) ?? null,
    read,
    basis: h.against,
    changes: found.map((f) => f.change),
  });
  if ('refused' in proposal) return proposal;
  // a change numbered here, not by its tags, takes the id the proposal gave it: its decision is read the same way
  found.forEach((f, i) => {
    const d = unnumbered.get(f.change);
    const c = proposal.changes[i];
    if (d && c) decisions.set(c.id, d);
  });
  return { proposal, decisions, basisNow };
}
