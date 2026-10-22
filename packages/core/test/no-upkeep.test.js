// Nothing derived from a note needs looking after (editor spec §31, derivations_need_no_upkeep). An edit to the note's
// text is all it takes. Read again, the note gives fresh clusters, centroids, groups and lens lists. The person takes
// no step, and nothing is kept that could go stale, but the last centroids, which only save work.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { readNote } from '../src/drawing.ts';
import { groupsOf } from '../src/scale-groups.ts';

/** A note's one graph block: the Atoms cluster and three atoms, of which `members` join the cluster. */
const note = (members) =>
  [
    '// graph: g',
    "(atoms:Cluster {name: 'Atoms'}),",
    "(h:Atom {name: 'H', charge: 'none'}),",
    "(o:Atom {name: 'O', charge: 'none'}),",
    "(na:Atom {name: 'Na', charge: 'plus', likelihood: 'likely'}),",
    ...members.map((m, i) => `(${m})-[:MEMBER_OF]->(atoms)${i < members.length - 1 ? ',' : ''}`),
  ].join('\n');

const LENS = "MATCH (a:Atom) RETURN a.id AS id, CASE WHEN a.charge = 'plus' THEN 'Ions' ELSE 'Atoms' END AS grp";

/** What the note gives when read: its graph, drawing, clusters, centroids, groups and lens list. */
function derived(blocks, previous) {
  const reading = readNote(blocks);
  const graph = reading.world.g;
  const centroids = gs.centroidsOf(graph, { previous });
  return {
    clusters: gs.clustersOf(graph, 'asserted').clusters,
    centroids,
    groups: groupsOf(reading.graphs.get('g'), 500, 1).groups,
    lens: gs.lensBuckets(graph, LENS),
  };
}

test('an edit to the text refreshes clusters, centroids, groups and lens lists with no step from the person', () => {
  const before = derived([note(['h', 'o'])]);
  assert.deepEqual(before.clusters[0].members, ['h', 'o']);
  assert.deepEqual(before.groups[0].keys, ['atoms', 'h', 'o']);
  assert.deepEqual(before.lens, { h: 'Atoms', o: 'Atoms', na: 'Ions' });

  // the person writes Na into the cluster and changes O's charge; that is all
  const edited = note(['h', 'o', 'na']).replace("name: 'O', charge: 'none'", "name: 'O', charge: 'plus'");
  const after = derived([edited], before.centroids);
  assert.deepEqual(after.clusters[0].members, ['h', 'o', 'na']);
  assert.deepEqual(after.groups[0].keys, ['atoms', 'h', 'o', 'na']);
  assert.deepEqual(after.lens, { h: 'Atoms', o: 'Ions', na: 'Ions' });
  assert.deepEqual(after.centroids.recomputed, ['atoms']);
  assert.equal(after.centroids.centroids[0].members, 3);
  assert.notDeepEqual(after.centroids.centroids[0].certainty, before.centroids.centroids[0].certainty);
  assert.equal(after.centroids.centroids[0].id, before.centroids.centroids[0].id);
});

test('an edit that changes nothing a centroid is made from works out no centroid again', () => {
  const before = derived([note(['h', 'o'])]);
  const renamed = note(['h', 'o']).replace("name: 'H'", "name: 'Hydrogen'");
  assert.deepEqual(derived([renamed], before.centroids).centroids.recomputed, []);
});
