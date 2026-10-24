// What the permissions tests share (editor spec §39). A small permissions graph, written as GQL as a host keeps it, and
// the things it guards. Test support only — nothing here ships.
import gs from '@thoughtknot/graph-spec';
import { Permissions } from '../src/permissions.ts';

/** Roger owns it. Ann is an editor, with one asserted grant and one inferred. Bob is a reader with a withdrawn grant. */
export const PERMISSIONS = `// graph: permissions
(roger:Person {name: 'Roger', owner: TRUE}),
(ann:Person {name: 'Ann', team: 'north'}),
(bob:Person {name: 'Bob', team: 'south'}),
(cat:Person {name: 'Cat', team: 'north'}),
(editor:Role {name: 'Editor'}),
(reader:Role {name: 'Reader'}),
(editor_rule:GrantRule {access: 'read', tag: 'project'}),
(reader_rule:GrantRule {access: 'read', path: 'projects/'}),
(editor)-[:HAS_RULE]->(editor_rule),
(reader)-[:HAS_RULE]->(reader_rule),
(ann)-[:HAS_ROLE]->(editor),
(bob)-[:HAS_ROLE]->(reader),
(ann_plan:Grant {access: 'read', path: 'projects/plan.md', status: 'asserted'}),
(ann_notes:Grant {access: 'read', path: 'projects/notes.md', status: 'inferred'}),
(bob_plan:Grant {access: 'read', path: 'projects/plan.md', status: 'withdrawn'}),
(ann)-[:HOLDS]->(ann_plan),
(ann)-[:HOLDS]->(ann_notes),
(bob)-[:HOLDS]->(bob_plan),
(ann_plan)-[:FROM_RULE]->(editor_rule),
(ann_notes)-[:FROM_RULE]->(editor_rule),
(bob_plan)-[:FROM_RULE]->(reader_rule)`;

/** The graph a GQL text holds, read as the graph spec library reads it. */
export const graphOf = (text) => Object.values(gs.worldFromStore(gs.read([text])))[0];

/** The permissions a GQL text holds. */
export const permissionsOf = (text = PERMISSIONS) => new Permissions(graphOf(text));

/** The things guarded: the plan and the notes are tagged project; the diary is the owner's own. */
export const PLAN = { path: 'projects/plan.md', id: 'plan', tags: ['project'], likelihood: 'likely' };
export const NOTES = { path: 'projects/notes.md', id: 'notes', tags: ['project'] };
export const DIARY = { path: 'diary.md', id: 'diary', tags: [] };
export const THINGS = [PLAN, NOTES, DIARY];
