// A proposal as text (editor spec §17): graph-spec's change set (§24 H1) — a block whose first line is
// `// graph: G · CHANGE SET id · against <state> · by <author>`, then the things and links it adds and the SET lines that
// change a property — with what graph-spec's change set has no line for written beside it as comments, which its readers
// pass over: who proposed it and what it read, the removals, each change's id and group, and the decisions a person made
// (rejecting_recorded). So the change set in the note is the record: read again, it gives back the proposal and what has
// been decided, and graph-spec's own check still reads it as the change set it was. A decision is recorded by putting
// one line above the change it is about (`recordDecisions`); nothing else in the block is rewritten.
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
import { trim } from './whitespace.ts';

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
 * The change set for a proposal: graph-spec's lines for what it adds and sets (the items of each run parted by commas, the
 * SET after the things with none, as a block ends), the removals after them, and each change's id, group, reason and
 * decision above it. `basisNow` is the graph's state after the changes accepted so far.
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
  const adds = p.changes.flatMap((c) => (c.op === 'add' ? [c] : []));
  const sets = p.changes.flatMap((c) => (c.op === 'set' ? [c] : []));
  adds.forEach((c, i) => out.push(...tags(c), `${c.gql}${i < adds.length - 1 ? ',' : ''}`));
  sets.forEach((c, i) =>
    out.push(...tags(c), `${i === 0 ? 'SET ' : ''}${c.thing}.${c.key} = ${c.value}${i < sets.length - 1 ? ',' : ''}`),
  );
  for (const c of p.changes) {
    if (c.op !== 'remove-thing' && c.op !== 'remove-link') continue;
    out.push('', ...tags(c));
    out.push(c.op === 'remove-thing' ? `//@ remove: thing ${c.thing}` : `//@ remove: link ${c.from} ${c.type} ${c.to}`);
  }
  return out.join('\n');
}

// each pattern is matched against a line trimmed first, and reads the rest of the line as it is: nothing is matched twice
const TAG = /^\/\/@ ([A-Za-z_][\w.-]*):(.*)$/;
const NOTE = /^\/\/\/ ?(.*)$/;
const ASSIGN = /^(?:SET\s+)?([A-Za-z_]\w*)\s*\.\s*([A-Za-z_]\w*)\s*=/;
const REMOVE = /^\/\/@ remove: (thing|link) (.+)$/;
const COMMENT_TAG = /^\/\/[@/]/;
const META = {
  kind: /^\/\/ proposer kind: (\w+)$/,
  read: /^\/\/ read: (.*)$/,
  proposed: /^\/\/ proposed: (\S+)$/,
  basisNow: /^\/\/ basis now: ([0-9a-f]{16})$/,
};
const DECISION = /^\/\/@ (accepted|rejected):/;

/** A decision line's words, `roger, 2026-10-13T10:30:00Z`: who and when, each one word. */
function decisionOf(state: Decision['state'], words: string): Decision | null {
  const at = words.indexOf(', ');
  const by = words.slice(0, at),
    when = words.slice(at + 2);
  return at > 0 && by && when && !/\s/.test(by + when) ? { state, by, at: when } : null;
}

/** A change as it stands in the block: its line, where the comments above it begin, the change and what is decided of it. */
interface Located {
  line: number;
  runStart: number;
  change: ChangeInput;
  decision?: Decision;
}

/**
 * The changes a change set block holds, in the order they are written: each thing, link and SET line, and each removal
 * (a `//@ remove:` line), with the id, group and reason the comments directly above it give and the decision recorded there.
 */
function locate(block: string, lines: readonly string[]): Located[] {
  const out: Located[] = [];
  const hold = (line: number, change: ChangeInput) => {
    let runStart = line;
    while (runStart > 0 && COMMENT_TAG.test(trim(lines[runStart - 1] ?? ''))) runStart--;
    const run = lines.slice(runStart, line).map(trim);
    const tag = (key: string) => {
      const m = run.map((r) => TAG.exec(r)).find((x) => x?.[1] === key);
      return m ? trim(m[2] ?? '') : undefined;
    };
    const reason = run
      .map((r) => NOTE.exec(r)?.[1])
      .filter((n) => n)
      .map((n) => trim(n ?? ''))
      .join(' ');
    const id = tag('change'),
      group = tag('group');
    const held = { ...change, ...(id ? { id } : {}), ...(group ? { group } : {}), ...(reason ? { reason } : {}) };
    const state = (['accepted', 'rejected'] as const).find((s) => tag(s) !== undefined);
    const decision = state && decisionOf(state, tag(state) ?? '');
    out.push({ line, runStart, change: held, ...(decision ? { decision } : {}) });
  };
  const lineOf = lineIndex(block);
  let setting = false;
  for (const it of items(block)) {
    const text = block.slice(it.from, it.to);
    const word = /^[A-Za-z]+/.exec(trim(blankText(text)))?.[0].toUpperCase();
    if (word === 'SET') setting = true;
    const set = setting ? ASSIGN.exec(text) : null;
    hold(
      lineOf(it.from) - 1,
      set
        ? { op: 'set', thing: set[1] ?? '', key: set[2] ?? '', value: trim(text.slice(set[0].length)) }
        : { op: 'add', gql: text },
    );
  }
  lines.forEach((l, line) => {
    const m = REMOVE.exec(trim(l));
    if (!m) return;
    const words = trim(m[2] ?? '').split(/\s+/);
    hold(
      line,
      m[1] === 'thing'
        ? { op: 'remove-thing', thing: words[0] ?? '' }
        : { op: 'remove-link', from: words[0] ?? '', type: words[1] ?? '', to: words[2] ?? '' },
    );
  });
  return out.sort((a, b) => a.line - b.line);
}

/** The first of the header's comments that a line matches, by its trimmed text: what a change set says of itself. */
const metaOf = (lines: readonly string[], re: RegExp): string | undefined =>
  lines.map((l) => re.exec(trim(l))?.[1]).find((m) => m !== undefined);

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
  const kind = metaOf(lines, META.kind) ?? 'unknown';
  const located = locate(block, lines);
  const proposal = makeProposal({
    id: h.id,
    graph: h.graph,
    by: { name: h.by, kind: (KINDS.has(kind) ? kind : 'unknown') as ProposerKind },
    at: metaOf(lines, META.proposed) ?? null,
    read: (metaOf(lines, META.read) ?? '')
      .split(';')
      .map((r) => trim(r))
      .filter(Boolean),
    basis: h.against,
    changes: located.map((f) => f.change),
  });
  if ('refused' in proposal) return proposal;
  // a change numbered here, not by its tags, takes the id the proposal gave it: its decision is read the same way
  const decisions = new Map<string, Decision>();
  located.forEach((f, i) => {
    const c = proposal.changes[i];
    if (c && f.decision) decisions.set(c.id, f.decision);
  });
  return { proposal, decisions, basisNow: metaOf(lines, META.basisNow) ?? null };
}

/**
 * The block with what is decided recorded in it, and nothing else touched: a line `//@ accepted: who, when` (or rejected)
 * put above each change that has a decision — or the one already there replaced, or taken away when the decision is gone —
 * and the `// basis now:` line, the graph's state after the accepts, put with the header's other facts. Every other byte,
 * an author's comments among them, is kept. A block that no longer holds the proposal's changes is written afresh.
 */
export function recordDecisions(
  block: string,
  p: Proposal,
  decisions: ReadonlyMap<string, Decision>,
  basisNow: string | null,
): string {
  const lines = block.split('\n');
  const found = gs.changesetHeader(block) ? locate(block, lines) : [];
  const same =
    found.length === p.changes.length &&
    found.every((f, i) => f.change.id === undefined || f.change.id === p.changes[i]?.id);
  if (!same) return changeSetText(p, decisions, basisNow);
  // from the bottom up, so the lines above a change do not move before it is reached
  for (let i = found.length - 1; i >= 0; i--) {
    const f = found[i];
    const d = decisions.get(p.changes[i]?.id ?? '');
    if (!f) continue;
    const at = lines.findIndex((l, k) => k >= f.runStart && k < f.line && DECISION.test(trim(l)));
    const indent = /^[ \t]*/.exec(lines[f.line] ?? '')?.[0] ?? '';
    const line = d ? `${indent}//@ ${d.state}: ${oneWord(d.by)}, ${oneWord(d.at)}` : null;
    if (at >= 0) lines.splice(at, 1, ...(line === null ? [] : [line]));
    else if (line !== null) lines.splice(f.line, 0, line);
  }
  const now = lines.findIndex((l) => META.basisNow.test(trim(l)));
  const line = basisNow ? `// basis now: ${basisNow}` : null;
  if (now >= 0) lines.splice(now, 1, ...(line === null ? [] : [line]));
  else if (line !== null) {
    const facts = [META.kind, META.proposed, META.read];
    const last = lines.reduce((n, l, k) => (facts.some((re) => re.test(trim(l))) ? k : n), 0);
    lines.splice(last + 1, 0, line);
  }
  return lines.join('\n');
}
