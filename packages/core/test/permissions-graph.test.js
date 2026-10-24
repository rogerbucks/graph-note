// The permissions are graph data (editor spec §39, permissions_graph_native): roles are types and people instances of
// them, with attributes. Grants carry their status, join, and are asked about through lenses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { Permissions, whoCan } from '../src/permissions.ts';
import { joinPermissions } from '../src/permissions-change.ts';
import { PERMISSIONS, PLAN, graphOf, permissionsOf } from './permissions-fixtures.js';

test('a lens asking who can read a project returns exactly the people with an asserted grant', () => {
  // Ann's grant is asserted; Bob's was withdrawn; Cat holds none; Roger owns it all
  assert.deepEqual(whoCan(permissionsOf(), 'read', PLAN), ['roger', 'ann']);
  assert.deepEqual(whoCan(permissionsOf(), 'write', PLAN), ['roger']);
});

test('the grants are things in the graph, and a lens groups them by their status', () => {
  const g = graphOf(PERMISSIONS);
  const groups = gs.lensBuckets(
    g,
    "MATCH (g:Grant) RETURN g.id AS id, CASE WHEN g.status = 'asserted' THEN 'gives' WHEN g.status = 'inferred' THEN 'shown' ELSE 'stopped' END AS grp",
  );
  assert.deepEqual(groups, { ann_plan: 'gives', ann_notes: 'shown', bob_plan: 'stopped' });
});

test('people carry attributes, and a role is a type they are instances of', () => {
  const p = permissionsOf();
  assert.equal(p.graph.nodes.get('ann')[1].team, 'north');
  assert.deepEqual(p.rolesOf('ann'), ['editor']);
  assert.deepEqual(p.rolesOf('cat'), []);
});

test('permission graphs join: what one place grants and another adds are both there', () => {
  const extra = graphOf(`// graph: permissions
(cat:Person {name: 'Cat'}),
(editor:Role {name: 'Editor'}),
(editor_rule:GrantRule {access: 'read', tag: 'project'}),
(editor)-[:HAS_RULE]->(editor_rule),
(cat)-[:HAS_ROLE]->(editor),
(cat_plan:Grant {access: 'read', path: 'projects/plan.md', status: 'asserted'}),
(cat)-[:HOLDS]->(cat_plan),
(cat_plan)-[:FROM_RULE]->(editor_rule)`);
  const joined = new Permissions(
    joinPermissions([
      { id: 'home', graph: permissionsOf().graph },
      { id: 'work', graph: extra },
    ]),
  );
  assert.deepEqual(whoCan(joined, 'read', PLAN), ['roger', 'ann', 'cat']);
});
