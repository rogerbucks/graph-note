# Clusters design

This note covers how clusters and centroids are built (editor spec §31, workstream V3). Roger brought this work
forward on 22 October 2026, ahead of the mesh, so clusters are built on the same engine as the massive-graph groups.

## The short answer

| Question | Answer |
|---|---|
| What is a cluster? | A set of things that belong together. A thing may be in several |
| Where do clusters come from? | Two places. A person writes them, or an algorithm finds them. Each membership says which |
| What is a centroid? | A thing made for each cluster that sums it up: how many members, which kinds, and how certain they are |
| Where does the code live? | In both graph spec libraries, JavaScript and Python, so they always agree. The core reads them |
| What is the one engine? | One Louvain method, moved into the graph spec. The big-graph groups (`scale-groups.ts`) and clusters both use it |
| What waits for later? | How tightly a cluster holds together, and the opt-in floor on certainty. Both wait on the mesh (Wave 10) |

## How a cluster is written

A person writes a cluster as a thing, and joins members to it with a `MEMBER_OF` link:

```gql
(atoms:Cluster {name: 'Atoms'}),
(h:Atom {name: 'Hydrogen'})-[:MEMBER_OF]->(atoms),
(o:Atom {name: 'Oxygen'})-[:MEMBER_OF]->(atoms)
```

- **Hand-made clusters are asserted.** Their memberships have the kind `asserted`.
- **Found clusters are never written.** They are worked out from the links each time, so the text stays the only store.
  Their memberships have the kind `found` and a counted confidence.
- **Keeping a found cluster** writes it out as a hand-made one. This is always a proposal a person applies.
- **A thing may join any number of clusters.** It is never forced under one parent.

## Found clusters and their confidence

Found clusters come from the Louvain method. It is the same code the massive-graph groups use today. It moves from
`packages/core/src/louvain.ts` into the graph spec library, and Python gets the same method. A parity test checks that
both give the same groups for the same graph.

Louvain runs over every thing that is not a cluster, by every link but `MEMBER_OF`. A group of one thing is not a
cluster. A found cluster is named `found:` and its first member, so the same graph gives the same names.

A found cluster's confidence is counted, not guessed. It is the share of its members' links that stay inside it. A
cluster whose links all stay inside has confidence 1. A cluster whose links mostly leave it has confidence near 0. A
written cluster has no counted confidence.

A view can show one kind only. Then each thing's 1/N counts only the clusters of that kind.

## Centroids

Each cluster gets one centroid. It is a thing of kind `Centroid`, derived and never written in the note.

- **Its id comes from its cluster's id**, as a named SHA-256 hash (`spec_hashes_named`). So a rebuild gives the same id.
- **It holds a summary.** The number of members, the kinds they have, and a certainty range.
- **Each member counts 1/N** in each of its N clusters. A thing in four clusters counts a quarter in each.
- **Centroids can nest.** When a cluster is a member of a bigger one, its centroid counts as one member there. So atoms
  sum up into molecules, and molecules into cells. No domain gets special handling.

## Keeping centroids up to date

- **Only what changed is worked out again.** An edit that adds or drops a member marks that member's clusters as
  changed. Their centroids are worked out again, then the clusters above them. Any other edit recomputes nothing.
- **Each centroid is updated at most once a pass.** Passes repeat until no value moves by more than a small amount.
- **There is a maximum number of passes.** Clusters that are still moving at the maximum are flagged as *unsettled*.
  An unsettled centroid is never reported as settled, whatever the time budget.
- **Cycles are allowed.** Cluster A may sit inside cluster B, and B inside A. A cycle is flagged, never refused. A view
  can hide or highlight the clusters in a cycle.
- **There is nothing for the person to do.** Clusters and centroids are worked out again by themselves after each edit.

## How the massive-graph groups use clusters

`groupsOf` keeps its return shape, because the overview reads it. Written clusters join the style graph's groups as
the first place groups come from. A thing in several clusters is put in the first one written, since a layout group
must hold each thing once. Louvain is still the fallback, now called from the graph spec.

## How it is built

Each step is a pull request: the spec, then a test that fails first, then the code.

| Step | What | Requirements |
|---|---|---|
| 1 | This note | — |
| 2 | Louvain moved into the graph spec, with a Python twin and a parity test | (one engine) |
| 3 | Written and found clusters, their kinds, confidence and 1/N weights | `cluster_kind_recorded`, `multiple_membership` |
| 4 | Centroids: ids from the cluster, nesting, recompute only what changed, the pass limit | `recursive_centroids`, `stored_centroids`, `centroid_cycle_guard`, `centroids_correct_first` |
| 5 | Cycles flagged, and views that hide or highlight them | `cycles_allowed_flagged` |
| 6 | Worked out after every edit with no step for the person, and read by `groupsOf` | `derivations_need_no_upkeep` |

## Choices made, and the alternatives

| Choice | Picked | Not picked, and why |
|---|---|---|
| Where clusters live | Both graph spec libraries | The core only: Python would have no clusters, and the two readers must agree |
| How a member is written | A `MEMBER_OF` link to a cluster thing | A list on the cluster: harder to diff, and a thing could not say which clusters it is in |
| Found clusters | Worked out each time, never written | Written into the note: the text would change without a person asking |
| One engine | Louvain moved into the graph spec | A second method for clusters: the overview and the cluster view would group things differently |
| Confidence | Share of links that stay inside | Modularity: harder to explain, and it depends on the whole graph |
