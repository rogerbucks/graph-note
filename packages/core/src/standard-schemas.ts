// The standard schemas (spec §27, standard_schemas): shared schemas the library ships, each named with its version, so a
// graph can name one — `// graph: reader · schema decision@1` — and its note needs no schema of its own. A vault's own
// schema of the same name and version is used in its place; the standard one is never copied into a note.
import { firstLine } from './blocks.ts';
import { N, S } from './whitespace.ts';

const SHARED_NAME = new RegExp(`·${S}*SCHEMA${S}+(${N}+)`);

/** Each standard schema, as a shared schema block: its graph line names it with its version. */
export const STANDARD_SCHEMAS: readonly string[] = [
  `// graph: decision · SCHEMA decision@1
// The standard schema for a decision: a question, the options that answer it, and the reasons for and against each.
(decision_schema:GraphMeta {graph: 'decision', schema: 'decision@1'}),
(kind_question:Meta:ElementType {name: 'Question', kind: 'node', origin: 'source'}),
(kind_option:Meta:ElementType {name: 'Option', kind: 'node', origin: 'source'}),
(kind_reason:Meta:ElementType {name: 'Reason', kind: 'node', origin: 'source'}),
(link_answers:Meta:ElementType {name: 'ANSWERS', kind: 'edge', origin: 'source',
    reading: 'answers', reverse_name: 'is answered by'}),
(link_favours:Meta:ElementType {name: 'FAVOURS', kind: 'edge', origin: 'source',
    reading: 'favours', reverse_name: 'is favoured by'}),
(link_counts_against:Meta:ElementType {name: 'COUNTS_AGAINST', kind: 'edge', origin: 'source',
    reading: 'counts against', reverse_name: 'is counted against by'}),
(decision_schema)-[:DECLARES]->(kind_question),
(decision_schema)-[:DECLARES]->(kind_option),
(decision_schema)-[:DECLARES]->(kind_reason),
(decision_schema)-[:DECLARES]->(link_answers),
(decision_schema)-[:DECLARES]->(link_favours),
(decision_schema)-[:DECLARES]->(link_counts_against)`,
];

/** The name a shared schema block gives itself, with its version: `decision@1`; null for any other block. */
export const sharedSchemaName = (block: string): string | null => SHARED_NAME.exec(firstLine(block))?.[1] ?? null;

/** A vault's shared schema blocks with the standard ones after them, each standard one only when the vault has none of its name. */
export function withStandardSchemas(vault: readonly string[]): string[] {
  const own = new Set(vault.map(sharedSchemaName));
  return [...vault, ...STANDARD_SCHEMAS.filter((s) => !own.has(sharedSchemaName(s)))];
}
