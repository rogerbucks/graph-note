// What a person decided about a proposal's changes, kept in the note (editor spec §17, rejecting_recorded, decider_named; the
// graph spec's §23 and §24, cs-rejected-out). An accepted change is in the graph and a rejected one is nowhere in it, and
// neither stays in the change set, where any tool that applied the set would apply it again. Each decision is a `Decision`
// in the note's judgement graph, a gql block whose graph is `judgements` (or ends `_judgements`): reused when the note has
// one, else added after the change set. It holds the change's statement, so a decided change is still shown and a
// rejected one can be read again, who proposed it (the change set's `by`) and who decided and when. The decider is plain
// text, kept exactly as typed in the settings, or "you" when none is set. Each Decision is also WAS_ATTRIBUTED_TO the
// proposer and the decider (W3C PROV, the graph spec's req:24.prov-attributed), agents of this judgement graph only: the
// decider is never a link to a Person of the data graph.
import { items } from './block-items.ts';
import { appended } from './linked-list.ts';
import { dataKind, gqlSpans, graphOf } from './blocks.ts';
import type { Span } from './blocks.ts';
import { readNote } from './drawing.ts';
import { valueGql } from './proposals.ts';
import type { ChangeInput, ProposedChange, Proposer, ProposerKind } from './proposals.ts';
import { readStatement, statementOf } from './proposals-statements.ts';
import { insertBlockAfter, replaceBlock } from './store.ts';
import { trim } from './whitespace.ts';

/** What a person decided about a change: accepted or rejected, who decided (as typed) and when. */
export interface Decision {
  state: 'accepted' | 'rejected';
  by: string;
  at: string;
}

/** The name a decision records when the settings name nobody. */
export const DECIDER_DEFAULT = 'you';

/**
 * Who decides, from the settings' text: exactly as typed (spaces and capitals kept), or "you" when it is empty or only
 * spaces. Never a link to a Person.
 */
export const deciderName = (setting: string | null | undefined): string =>
  typeof setting === 'string' && trim(setting) ? setting : DECIDER_DEFAULT;

/** A change decided, as the note keeps it: the change, the decision, and its place among the proposal's changes. */
export interface Decided {
  change: ChangeInput;
  decision: Decision;
  order: number;
}

/** A decision to write: the proposal's change with its place and what was decided. */
export interface ToRecord {
  change: ProposedChange;
  decision: Decision;
  order: number;
}

/** The graph name that is a judgement graph here: `judgements`, or a name ending `_judgements`. */
const isJudgement = (name: string | null): boolean => name === 'judgements' || /_judgements$/.test(name ?? '');

/** Whether a block is a judgement block: a block of data, never a change set, a query or a schema, of such a graph. */
const isJudgementBlock = (text: string): boolean => dataKind(text) === 'data' && isJudgement(graphOf(text));

/** The note's judgement block, if it has one: the first gql block whose graph line names a judgement graph. */
export const judgementSpan = (note: string): Span | undefined => gqlSpans(note).find((s) => isJudgementBlock(s.text));

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/**
 * The decisions the note's judgement block records for one proposal: each change as its statement was kept (a SET, a
 * DELETE or an addition's item), with its group and reason, the decision and the place it had among the proposal's
 * changes. A record that cannot be read back as a change is left out.
 */
export function decidedIn(note: string, graph: string, proposal: string): Decided[] {
  const span = judgementSpan(note);
  const name = span ? graphOf(span.text) : null;
  const g = span && name ? readNote([span.text]).world[name] : undefined;
  if (!g) return [];
  const out: Decided[] = [];
  for (const id of g.labelled('Decision')) {
    const p = g.p(id);
    const statement = str(p.statement);
    const state = p.state === 'accepted' || p.state === 'rejected' ? p.state : null;
    if (p.graph !== graph || p.change_set !== proposal || !statement || !state) continue;
    const word = /^[A-Za-z]+/.exec(trim(statement))?.[0].toUpperCase();
    const op = word === 'SET' || word === 'MATCH' ? readStatement(statement) : ({ op: 'add', gql: statement } as const);
    if ('refused' in op) continue;
    const group = str(p.group),
      reason = str(p.reason);
    out.push({
      change: { ...op, ...(group ? { group } : {}), ...(reason ? { reason } : {}) },
      decision: { state, by: str(p.decided_by) ?? DECIDER_DEFAULT, at: str(p.at) ?? '' },
      order: typeof p.order === 'number' ? p.order : out.length,
    });
  }
  return out.sort((a, b) => a.order - b.order);
}

/**
 * The changes a change set holds still waiting and those the note's judgement graph says were decided, in the order they
 * were proposed: each decided one at the place it had, the waiting ones filling the rest. `at` says which places hold
 * a decided change, and what was decided of it.
 */
export function inOrder(
  decided: readonly Decided[],
  waiting: readonly ChangeInput[],
): { inputs: ChangeInput[]; at: Map<number, Decision> } {
  const total = decided.length + waiting.length;
  const slots = new Array<ChangeInput | undefined>(total).fill(undefined);
  const at = new Map<number, Decision>();
  for (const d of decided) {
    let i = Math.min(Math.max(d.order, 0), total - 1);
    while (slots[i] !== undefined) i = (i + 1) % total;
    slots[i] = d.change;
    at.set(i, d.decision);
  }
  const rest = [...waiting];
  const inputs = slots.flatMap((s) => (s ? [s] : rest.splice(0, 1)));
  return { inputs, at };
}

/** A node name for a decision: the graph, the proposal and the change's id, so one change decided once is one record. */
const nameOf = (graph: string, proposal: string, change: string): string =>
  `decision_${graph}_${proposal}_${change}`.replace(/\W/g, '_');

/** One Decision as an item of the judgement block: every property on the one line, text quoted as GQL writes it. */
function itemOf(r: ToRecord, graph: string, proposal: string, proposedBy: string): string {
  const c = r.change;
  const text = statementOf(c);
  const props = [
    `state: ${valueGql(r.decision.state)}`,
    `change_set: ${valueGql(proposal)}`,
    `graph: ${valueGql(graph)}`,
    `change: ${valueGql(c.id)}`,
    `statement: ${valueGql(text)}`,
    `group: ${valueGql(c.group)}`,
    ...(c.reason ? [`reason: ${valueGql(c.reason)}`] : []),
    `proposed_by: ${valueGql(proposedBy)}`,
    `decided_by: ${valueGql(r.decision.by)}`,
    `at: ${valueGql(r.decision.at)}`,
    `order: ${r.order}`,
  ];
  return `(${nameOf(graph, proposal, c.id)}:Decision {${props.join(', ')}})`;
}

/** An agent's label in the judgement graph: a Model for a model, a Person for a person or a graph step, none when the kind is unknown. */
const agentLabel = (kind: ProposerKind): string | null =>
  kind === 'model' ? 'Model' : kind === 'unknown' ? null : 'Person';

/** A short hash of a text (FNV-1a over its UTF-16 units, in hex), to tell agents of different names apart in a node name. */
function shortHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/**
 * The agent a name is, as an item of the judgement block (the graph spec's req:24.prov-attributed): its node name and the
 * item to write, or null when the block already holds exactly that item. The name is kept exactly as typed; a node name
 * the block holds for something else is never reused.
 */
function agentNode(block: string, label: string, name: string, added: readonly string[]) {
  const held = [...(block ? items(block).map((it) => block.slice(it.from, it.to)) : []), ...added];
  for (let n = 0; ; n++) {
    const node = `agent_${label.toLowerCase()}_${name.replace(/\W/g, '_').slice(0, 24)}_${shortHash(name)}${n ? `_${n}` : ''}`;
    const item = `(${node}:${label} {name: ${valueGql(name)}})`;
    if (held.includes(item)) return { node, item: null };
    if (!held.some((t) => t.startsWith(`(${node}:`))) return { node, item };
  }
}

/** What writing the decisions did to the note: the note, and the judgement block as it was (null: there was none) and is. */
export interface Written {
  note: string;
  before: string | null;
  after: string;
}

/**
 * The note with these decisions in its judgement block: appended to the one it has, else a new block after `after` (the
 * change set, or the last gql block). Nothing else is touched. Null when the note has nowhere to write one.
 */
export function withDecisions(
  note: string,
  graph: string,
  proposal: string,
  proposedBy: Proposer,
  records: readonly ToRecord[],
  after: Span | undefined,
): Written | null {
  const span = judgementSpan(note);
  // who proposed and who decided are agents of the judgement graph, each Decision WAS_ATTRIBUTED_TO both (req:24.prov-attributed)
  const agents: string[] = [];
  const attribute = (decision: string, role: string, kind: ProposerKind, name: string): string[] => {
    const label = agentLabel(kind);
    if (!label) return [];
    const a = agentNode(span?.text ?? '', label, name, agents);
    if (a.item) agents.push(a.item);
    return [`(${decision})-[:WAS_ATTRIBUTED_TO {role: ${valueGql(role)}}]->(${a.node})`];
  };
  const links = records.flatMap((r) => {
    const d = nameOf(graph, proposal, r.change.id);
    return [
      ...attribute(d, 'proposed', proposedBy.kind, proposedBy.name),
      ...attribute(d, 'decided', 'person', r.decision.by),
    ];
  });
  const lines = [...records.map((r) => itemOf(r, graph, proposal, proposedBy.name)), ...agents, ...links];
  if (span) {
    const text = appended(span.text, lines);
    const w = replaceBlock(note, { line: span.open, text: span.text }, text);
    return w.ok ? { note: w.note, before: span.text, after: text } : null;
  }
  const anchor = after ?? gqlSpans(note).at(-1);
  const text = `// graph: judgements\n${lines.join(',\n')}`;
  if (!anchor) {
    const eol = note.endsWith('\n') || !note ? '' : '\n';
    return { note: `${note}${eol}\n\`\`\`gql\n${text}\n\`\`\`\n`, before: null, after: text };
  }
  const w = insertBlockAfter(note, { line: anchor.open, text: anchor.text }, text);
  return w.ok ? { note: w.note, before: null, after: text } : null;
}

/**
 * The judgement block taken back to what it was: the block this wrote put back as it was, or taken out when this made
 * it. Refused, with why, when the block is not the one written (it changed since).
 */
export function withoutDecisions(
  note: string,
  w: Pick<Written, 'before' | 'after'>,
): { ok: true; note: string } | { ok: false; reason: string } {
  const span = gqlSpans(note).find((s) => s.text === w.after && isJudgementBlock(s.text));
  if (!span)
    return { ok: false, reason: 'the judgement block has changed since the decision was made, so it cannot be undone' };
  if (w.before !== null) {
    const r = replaceBlock(note, { line: span.open, text: span.text }, w.before);
    return r.ok ? { ok: true, note: r.note } : { ok: false, reason: r.reason };
  }
  // the block this wrote, with the blank line before its fence that writing it added
  const all = note.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const from = span.open > 0 && trim(all[span.open - 1] ?? '') === '' ? span.open - 1 : span.open;
  all.splice(from, span.close + 1 - from);
  return { ok: true, note: all.join('') };
}
