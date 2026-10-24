// Each role holds its own rules (editor spec §39, role_grant_rules). A rule matches by attributes, such as a tag and a
// least certainty. A person gets only their roles' grants, a role never inherits from another, and a role with no rules
// gets nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruleMatches } from '../src/permissions.ts';
import { previewChange, proposedGrants } from '../src/permissions-change.ts';
import { NOTES, PLAN, THINGS, permissionsOf } from './permissions-fixtures.js';

const ROLES = `// graph: permissions
(roger:Person {name: 'Roger', owner: TRUE}),
(ann:Person {name: 'Ann'}),
(dan:Person {name: 'Dan'}),
(editor:Role {name: 'Editor'}),
(intern:Role {name: 'Intern'}),
(rule:GrantRule {access: 'read', tag: 'project'}),
(editor)-[:HAS_RULE]->(rule),
(intern)-[:EXTENDS]->(editor),
(intern)-[:PART_OF]->(editor),
(ann)-[:HAS_ROLE]->(editor),
(dan)-[:HAS_ROLE]->(intern),
(dan_plan:Grant {access: 'read', path: 'projects/plan.md', status: 'asserted'}),
(dan)-[:HOLDS]->(dan_plan),
(dan_plan)-[:FROM_RULE]->(rule)`;

test('a role with no rules grants nothing, whatever its relation to other roles', () => {
  const p = permissionsOf(ROLES);
  assert.deepEqual(p.rulesOf('intern'), []);
  assert.deepEqual(previewChange(p, { kind: 'give-role', person: 'dan', role: 'intern' }, THINGS).grants, []);
  assert.deepEqual(
    proposedGrants(p, THINGS).map((g) => g.person),
    ['ann', 'ann'],
  );
  // a grant from a rule of a role Dan does not hold gives nothing, even asserted
  assert.deepEqual(p.check('dan', 'read', PLAN), { ok: false, why: 'not-their-role' });
});

test('a rule matches by every attribute it names, and one that names none matches nothing', () => {
  assert.equal(ruleMatches({ tag: 'project' }, PLAN), true);
  assert.equal(ruleMatches({ tag: 'project', minLikelihood: 'likely' }, PLAN), true);
  assert.equal(ruleMatches({ tag: 'project', minLikelihood: 'very-likely' }, PLAN), false);
  assert.equal(ruleMatches({ tag: 'project', minLikelihood: 'likely' }, NOTES), false, 'no likelihood is not enough');
  assert.equal(ruleMatches({ path: 'projects' }, NOTES), true);
  assert.equal(ruleMatches({ path: 'projects' }, { path: 'projects-old/x.md' }), false, 'a folder, not a prefix');
  assert.equal(ruleMatches({ minLikelihood: 'not-a-word' }, PLAN), false);
  assert.equal(ruleMatches({}, PLAN), false);
});

test('a person gets only the grants of their own roles', () => {
  const p = permissionsOf();
  // Ann is an editor (tagged project), Bob a reader (the projects folder): each is proposed only their own rule's matches
  const byPerson = Object.groupBy(proposedGrants(p, THINGS), (g) => g.person);
  assert.deepEqual(
    byPerson.ann.map((g) => g.rule),
    ['editor_rule'],
  );
  assert.deepEqual([...new Set(byPerson.bob.map((g) => g.rule))], ['reader_rule']);
  assert.equal(byPerson.cat, undefined);
});
