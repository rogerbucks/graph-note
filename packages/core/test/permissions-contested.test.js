// Joined graphs that disagree pause a grant (editor spec §39, contested_grants_paused). Its status becomes contested,
// access stops until a join settles it, and the dispute stays visible through a lens. The owner's access is never
// paused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Permissions, disputes } from '../src/permissions.ts';
import { joinPermissions } from '../src/permissions-change.ts';
import { DIARY, PERMISSIONS, PLAN, graphOf } from './permissions-fixtures.js';

const home = graphOf(PERMISSIONS);
const work = (status) =>
  graphOf(`// graph: permissions
(ann:Person {name: 'Ann'}),
(ann_plan:Grant {access: 'read', path: 'projects/plan.md', status: '${status}'}),
(ann)-[:HOLDS]->(ann_plan),
(roger:Person {name: 'Roger'}),
(roger_diary:Grant {access: 'read', path: 'diary.md', status: 'withdrawn'}),
(roger)-[:HOLDS]->(roger_diary)`);
const joined = (status) =>
  new Permissions(
    joinPermissions([
      { id: 'home', graph: home },
      { id: 'work', graph: work(status) },
    ]),
  );

test('conflicting joins on a grant to another person stop access and the dispute lens lists it, while the owner’s access is unaffected', () => {
  const p = joined('withdrawn');
  assert.equal(p.allows('ann', 'read', PLAN), false);
  assert.deepEqual(
    disputes(p).map((g) => [g.id, g.person, g.disputed]),
    [['ann_plan', 'ann', 'home: asserted; work: withdrawn']],
  );
  assert.equal(p.allows('roger', 'read', DIARY), true);
  assert.equal(p.allows('roger', 'read', PLAN), true);
});

test('a later join that agrees settles the grant, and it gives access again', () => {
  const p = joined('asserted');
  assert.deepEqual(disputes(p), []);
  assert.equal(p.allows('ann', 'read', PLAN), true);
});

test('an untrusted graph cannot contest a grant', () => {
  const p = new Permissions(
    joinPermissions([
      { id: 'home', graph: home, trust: 'own' },
      { id: 'stranger', graph: work('withdrawn'), trust: 'untrusted' },
    ]),
  );
  assert.deepEqual(disputes(p), []);
  assert.equal(p.allows('ann', 'read', PLAN), true);
});
