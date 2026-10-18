// A proposal as text (editor spec §17). It is graph-spec's change set (§24), a block whose first line is
// `// graph: G · CHANGE SET id · against <state> · by <author>`. Then come the things and links it adds as a block
// writes them. Then comes a statement for each of its other changes: a `SET thing.key = value`, or a `DELETE` of one
// thing or link. So every
// tool that reads GQL reads it, and graph-spec's own check (`checkChangeset`) reads it as the change set it is. The header
// alone says what it was made against and who made it. A change's id is derived from its statement by the graph library
// and never written. An optional `//@ reason:` line directly above a change gives the source's reason. A `//@ group:`
// line gives the group it is reviewed in, when that is not the one its kind gives. When it was proposed and what it
// read are comments (`// proposed:`, `// read:`) the check passes over. What a person decided is not here. An accepted
// change is in the graph and a rejected one is nowhere. Both are kept as decisions in the judgement graph
// (`proposals-judgement.ts`). So the block holds only what still waits.
//
//   // graph: reader · CHANGE SET cs1 · against 05d75fdcbdb1d37b · by ada
//   // proposed: 2026-10-13T09:00:00Z
//   // read: reader; Notes/Devices
//   //@ reason: a smaller one for a pocket
//   (small_reader:Option {name: 'Small reader'}),
//   (small_reader)-[:ANSWERS]->(question)
//   SET large_reader.price = 4
//   MATCH (v {id: 'alice'}) DETACH DELETE v
import gs from '@thoughtknot/graph-spec';
import { items, lineIndex } from './block-items.ts';
import { groupOf } from './proposals.ts';
import type { ChangeInput, Proposal } from './proposals.ts';
import { readStatement, statementOf } from './proposals-statements.ts';
import { trim } from './whitespace.ts';

/** The graph and the id a change set's first line names; null for a block that is not a change set. */
export function changeSetId(block: string): { graph: string; id: string } | null {
  const h = gs.changesetHeader(block);
  return h ? { graph: h.graph, id: h.id } : null;
}

/** A name or a time as a line holds it: no space or comma in it. */
export const oneWord = (s: string): string => s.replace(/[\s,]+/g, '_');

/**
 * The change set for a proposal. It holds the header, the facts a comment holds, and the things and links it adds (the
 * items of a run parted by commas). Then each other change as the statement it is. Each change has its group above it
 * when that is not the one its kind gives, and its reason, directly above.
 */
export function changeSetText(p: Proposal): string {
  const { by, at, read, basis } = p.provenance;
  const out = [
    `// graph: ${p.graph} · CHANGE SET ${p.id} · against ${basis} · by ${by.name}`,
    ...(at ? [`// proposed: ${at}`] : []),
    ...(read.length ? [`// read: ${read.join('; ')}`] : []),
  ];
  const tags = (c: Proposal['changes'][number]): string[] => [
    ...(c.group === groupOf(c) ? [] : [`//@ group: ${c.group}`]),
    ...(c.reason ? [`//@ reason: ${c.reason}`] : []),
  ];
  const adds = p.changes.flatMap((c) => (c.op === 'add' ? [c] : []));
  adds.forEach((c, i) => out.push(...tags(c), `${c.gql}${i < adds.length - 1 ? ',' : ''}`));
  for (const c of p.changes) if (c.op !== 'add') out.push(...tags(c), statementOf(c));
  return out.join('\n');
}

/** A change set read back: what its header and comments say, and the changes it holds, in the order they are written. */
export interface ChangeSetRead {
  id: string;
  graph: string;
  by: string;
  basis: string;
  at: string | null;
  read: string[];
  changes: ChangeInput[];
}

// each pattern is matched against a line trimmed first, and reads the rest of the line as it is: nothing is matched twice
const TAG = /^\/\/@ ([A-Za-z_][\w.-]*):(.*)$/;
const COMMENT = /^\/\//;
const META = { read: /^\/\/ read: (.*)$/, proposed: /^\/\/ proposed: (\S+)$/ };
// what the editor wrote before a change set was GQL all through: removals, ids, decisions and the proposer's kind as comments
const OLD = /^\/\/(?:@ (?:change|remove|accepted|rejected):| (?:proposer kind|basis now):)/;

/** The first of the header's comments that a line matches, by its trimmed text: what a change set says of itself. */
const metaOf = (lines: readonly string[], re: RegExp): string | undefined =>
  lines.map((l) => re.exec(trim(l))?.[1]).find((m) => m !== undefined);

/**
 * A change set read back; or why it cannot be. It is read as the graph library's check reads it. The statements are the
 * DELETEs and SETs it finds, each naming one target, and the rest are additions. A change set in the old form — removals,
 * ids and decisions as comments, which other tools skip — is refused, saying so.
 */
export function readChangeSet(block: string): ChangeSetRead | { refused: string } {
  const h = gs.changesetHeader(block);
  if (!h)
    return {
      refused:
        'this is not a change set: its first line reads `// graph: <graph> · CHANGE SET <id> · against <state> · by <author>`',
    };
  const lines = block.split('\n');
  if (lines.some((l) => OLD.test(trim(l))))
    return {
      refused:
        'this change set is in the editor’s old form, where removals, ids and decisions were comments that other tools skip, so a rejected change stayed live. It is not read: remove the block and ask for the proposal again',
    };
  const parts = gs.splitChangeset(block);
  // the comments directly above a line, up to the first line that is not one: its group and reason
  const tagsAbove = (line: number): { group?: string; reason?: string } => {
    const out: { group?: string; reason?: string } = {};
    for (let i = line - 1; i >= 0 && COMMENT.test(trim(lines[i] ?? '')); i--) {
      const m = TAG.exec(trim(lines[i] ?? ''));
      const value = trim(m?.[2] ?? '');
      if (m?.[1] === 'group' && value) out.group ??= value;
      if (m?.[1] === 'reason' && value) out.reason ??= value;
    }
    return out;
  };
  const found: { line: number; change: ChangeInput }[] = [];
  for (const c of parts.changes) {
    const op = readStatement(c.text);
    if ('refused' in op) return { refused: `line ${c.line}: ${op.refused}` };
    found.push({ line: c.line - 1, change: { ...op, ...tagsAbove(c.line - 1) } });
  }
  const lineOf = lineIndex(parts.additions);
  for (const it of items(parts.additions)) {
    const line = lineOf(it.from) - 1;
    found.push({ line, change: { op: 'add', gql: parts.additions.slice(it.from, it.to), ...tagsAbove(line) } });
  }
  return {
    id: h.id,
    graph: h.graph,
    by: h.by,
    basis: h.against,
    at: metaOf(lines, META.proposed) ?? null,
    read: (metaOf(lines, META.read) ?? '')
      .split(';')
      .map((r) => trim(r))
      .filter(Boolean),
    changes: found.sort((a, b) => a.line - b.line).map((f) => f.change),
  };
}
