// The AI query contract (editor spec §37). An outside AI system, one that runs locally among them, asks the knowledge
// through the engine and under its permissions (ai_systems_query).
// - The contract is small: one query tool, one description of the schema, and strict checks (ai_minimal_contract). It
//   is a part that can be replaced whole.
// - A query is data, never text joined together. Each part is checked as untrusted (ai_queries_untrusted). Anything
//   unknown is refused, and so is any write, any name that is not one word, and any value that is not plain. A query that passes only
//   reads, so it runs freely.
// - The permissions come first: a client that may not read the note is refused, and nothing is read for it.
// - Every result carries where it came from: the note, the graph and the thing, so a model can cite it
//   (ai_provenance_with_results).
// - Every query is logged with the AI label, refused ones too.
import type { Graph, Value } from '@thoughtknot/graph-spec';
import type { Guarded, NoAccess, Permissions } from './permissions.ts';

/** The one tool an AI is offered: its name, what it does, and the shape of its input, as JSON Schema. */
export const AI_QUERY_TOOL = Object.freeze({
  name: 'query_graph',
  description:
    'Reads things from a graph the user shares. It only reads. Give a label to match, conditions on properties, and how many to return.',
  input_schema: Object.freeze({
    type: 'object',
    additionalProperties: false,
    required: ['graph', 'match'],
    properties: {
      graph: { type: 'string' },
      match: { type: 'string' },
      where: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['key', 'op', 'value'],
          properties: {
            key: { type: 'string' },
            op: { enum: ['=', '<>', '<', '>', '<=', '>='] },
            value: { type: ['string', 'number', 'boolean'] },
          },
        },
      },
      linked: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 200 },
    },
  }),
});

/** The comparisons a condition may make. */
const OPS = ['=', '<>', '<', '>', '<=', '>='] as const;
type Op = (typeof OPS)[number];

/** A query an AI sends, once checked: a graph, a label, conditions, a link type to follow, and a limit. */
export interface AiQuery {
  graph: string;
  match: string;
  where: { key: string; op: Op; value: string | number | boolean }[];
  linked?: string;
  limit: number;
}

/** Why a query was refused, as a code a host turns into words. */
export type QueryFault = 'not-an-object' | 'unknown-field' | 'not-a-name' | 'bad-condition' | 'bad-limit' | 'too-long';

/** The most a query returns, and the most conditions it may hold. */
export const QUERY_LIMITS = Object.freeze({ results: 200, conditions: 16, nameLength: 64 });

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FIELDS = new Set(['graph', 'match', 'where', 'linked', 'limit']);
const isName = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= QUERY_LIMITS.nameLength && NAME.test(v);
const isPlain = (v: unknown): v is string | number | boolean =>
  (typeof v === 'string' && v.length <= 1000) ||
  (typeof v === 'number' && Number.isFinite(v)) ||
  typeof v === 'boolean';
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** An AI's query checked as untrusted input: the query to run, or why it is refused. Nothing in it is ever run as text. */
export function checkQuery(input: unknown): { ok: true; query: AiQuery } | { ok: false; fault: QueryFault } {
  if (!isRecord(input)) return { ok: false, fault: 'not-an-object' };
  if (Object.keys(input).some((k) => !FIELDS.has(k))) return { ok: false, fault: 'unknown-field' };
  const { graph, match, where = [], linked, limit = 50 } = input;
  if (!isName(graph) || !isName(match) || (linked !== undefined && !isName(linked)))
    return { ok: false, fault: 'not-a-name' };
  if (!Array.isArray(where)) return { ok: false, fault: 'bad-condition' };
  if (where.length > QUERY_LIMITS.conditions) return { ok: false, fault: 'too-long' };
  const conditions: AiQuery['where'] = [];
  for (const c of where) {
    if (!isRecord(c) || Object.keys(c).sort().join() !== 'key,op,value') return { ok: false, fault: 'bad-condition' };
    if (!isName(c['key']) || !(OPS as readonly unknown[]).includes(c['op']) || !isPlain(c['value']))
      return { ok: false, fault: 'bad-condition' };
    conditions.push({ key: c['key'], op: c['op'] as Op, value: c['value'] });
  }
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > QUERY_LIMITS.results)
    return { ok: false, fault: 'bad-limit' };
  const query: AiQuery = { graph, match, where: conditions, limit };
  if (linked !== undefined) query.linked = linked;
  return { ok: true, query };
}

/** The one description of the schema an AI is given: each label with its properties, and each link type, sorted. */
export function schemaDescription(g: Pick<Graph, 'nodes' | 'edges'>): {
  labels: Record<string, string[]>;
  links: string[];
} {
  const labels: Record<string, Set<string>> = {};
  for (const [labelSet, props] of g.nodes.values())
    for (const l of labelSet) {
      const keys = labels[l] ?? (labels[l] = new Set());
      for (const k of Object.keys(props)) keys.add(k);
    }
  const sorted = Object.fromEntries(
    Object.keys(labels)
      .sort()
      .map((l) => [l, [...(labels[l] ?? [])].sort()]),
  );
  return { labels: sorted, links: [...new Set(g.edges.map((e) => e[1]))].sort() };
}

/** Where a result came from: the note's path, the graph, and the thing's id. */
export interface Source {
  note: string;
  graph: string;
  thing: string;
}

/** One result: a thing's id, labels and properties, and its source. */
export interface QueryResult {
  id: string;
  labels: string[];
  props: Record<string, Value>;
  source: Source;
}

/** A logged query: when, which client, the AI label, what it asked, and what came of it. */
export interface QueryLogEntry {
  at: string;
  client: string;
  label: 'ai';
  query: unknown;
  outcome: 'answered' | 'refused';
  results: number;
  why?: QueryFault | NoAccess | 'no-graph';
}

/** What the engine gives a query: the graph asked, the note it lives in, and how the permissions guard it. */
export interface QueryTarget {
  graph: Pick<Graph, 'nodes' | 'edges'>;
  note: Guarded;
}

/** The answer to a query: the results, or why it was refused. */
export type QueryAnswer = { ok: true; results: QueryResult[] } | { ok: false; why: QueryFault | NoAccess | 'no-graph' };

const holds = (have: Value | undefined, op: Op, want: string | number | boolean): boolean => {
  if (have === undefined || have === null) return false;
  if (op === '=') return have === want;
  if (op === '<>') return have !== want;
  if (typeof have !== typeof want) return false;
  const [a, b] = [have as string | number, want as string | number];
  return op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : a >= b;
};

/** The engine's side of the contract: it checks, guards, answers and logs each query an AI sends. */
export class AiQueryEngine {
  readonly log: QueryLogEntry[] = [];
  private readonly permissions: Permissions;
  private readonly targets: (graph: string) => QueryTarget | undefined;

  constructor(permissions: Permissions, targets: (graph: string) => QueryTarget | undefined) {
    this.permissions = permissions;
    this.targets = targets;
  }

  /** Answers `input` for `client`, at `at`. The permissions are checked before the graph is looked at. */
  query(client: string, input: unknown, at: string): QueryAnswer {
    const answer = this.answer(client, input);
    const entry: QueryLogEntry = {
      at,
      client,
      label: 'ai',
      query: JSON.parse(JSON.stringify(input ?? null)) as unknown,
      outcome: answer.ok ? 'answered' : 'refused',
      results: answer.ok ? answer.results.length : 0,
    };
    if (!answer.ok) entry.why = answer.why;
    this.log.push(entry);
    return answer;
  }

  private answer(client: string, input: unknown): QueryAnswer {
    const checked = checkQuery(input);
    if (!checked.ok) return { ok: false, why: checked.fault };
    const { query } = checked;
    const target = this.targets(query.graph);
    if (!target) return { ok: false, why: 'no-graph' };
    const allowed = this.permissions.check(client, 'read', target.note);
    if (!allowed.ok) return { ok: false, why: allowed.why };
    const g = target.graph;
    let ids = [...g.nodes]
      .filter(([, [labels, p]]) => labels.has(query.match) && query.where.every((c) => holds(p[c.key], c.op, c.value)))
      .map(([id]) => id);
    if (query.linked !== undefined) {
      const from = new Set(ids);
      ids = [...new Set(g.edges.filter((e) => e[1] === query.linked && from.has(e[0])).map((e) => e[2]))];
    }
    const results = ids.slice(0, query.limit).map((id): QueryResult => {
      const [labels, props] = g.nodes.get(id) ?? [new Set<string>(), {}];
      return {
        id,
        labels: [...labels].sort(),
        props: { ...props },
        source: { note: target.note.path, graph: query.graph, thing: id },
      };
    });
    return { ok: true, results };
  }
}

/** The whole contract an AI is given: one tool, and one way to describe the schema. Nothing else is offered. */
export const AI_CONTRACT = Object.freeze({ tools: Object.freeze([AI_QUERY_TOOL]), describeSchema: schemaDescription });
