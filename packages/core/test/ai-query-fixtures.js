// What the AI query tests share (editor spec §37). A graph in a note, the permissions over it, and an engine that
// answers queries for both. Test support only — nothing here ships.
import gs from '@thoughtknot/graph-spec';
import { AiQueryEngine } from '../src/ai-query.ts';
import { Permissions } from '../src/permissions.ts';

export const READER = `// graph: reader
(question:Question {name: 'Which device?'}),
(large:Option {name: 'Large reader', price: 300}),
(small:Option {name: 'Small reader', price: 120}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question)`;

/** Roger owns it; the local model ada has an asserted read grant on the note, the model bob none. */
export const PERMISSIONS = `// graph: permissions
(roger:Person {name: 'Roger', owner: TRUE}),
(ada:Person {name: 'Ada, a local model'}),
(bob:Person {name: 'Bob, a remote model'}),
(asker:Role {name: 'Asker'}),
(rule:GrantRule {access: 'read', tag: 'shared'}),
(asker)-[:HAS_RULE]->(rule),
(ada)-[:HAS_ROLE]->(asker),
(bob)-[:HAS_ROLE]->(asker),
(ada_reader:Grant {access: 'read', path: 'notes/reader.md', status: 'asserted'}),
(ada)-[:HOLDS]->(ada_reader),
(ada_reader)-[:FROM_RULE]->(rule)`;

const graphOf = (text) => Object.values(gs.worldFromStore(gs.read([text])))[0];
export const NOTE = { path: 'notes/reader.md', tags: ['shared'] };
export const AT = '2026-10-24T09:00:00Z';

/** An engine over the reader graph, and the graphs it was asked for, so a test sees nothing was read for a refusal. */
export function engine() {
  const asked = [];
  const target = { graph: graphOf(READER), note: NOTE };
  const e = new AiQueryEngine(new Permissions(graphOf(PERMISSIONS)), (graph) => {
    asked.push(graph);
    return graph === 'reader' ? target : undefined;
  });
  return { engine: e, asked, graph: target.graph };
}
