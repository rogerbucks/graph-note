# T-03 Path with missing step

**You should see:** in the first graph, a path whose second step names "parkk", which is not in the graph: the problem names the step and offers Remove the step, and pressing it renumbers the later steps. In the second graph, a Path with no STEP shows "the path … has no steps" and no Play button.

**Test diagram:**

```gql
// graph: walk · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(tour:Path {title: 'Walk'}),
(tour)-[:STEP {seq: 1}]->(home),
(tour)-[:STEP {seq: 2}]->(parkk),
(tour)-[:STEP {seq: 3}]->(home)
```

The second graph, with a path that has no steps.

```gql
// graph: empty_walk · SOURCE
(home:Place {name: 'Home'}),
(not_walked:Path {title: 'Not walked yet'})
```

<!-- expect: problem "the path Walk steps through parkk, which is not in graph walk" -->
<!-- expect: problem "the path Not walked yet has no steps" -->
<!-- expect: check "§22" -->

**Do this:**

1. Read the problem in the first graph's list: it should name step 2, parkk.
2. Press Remove the step, and check the later step is renumbered to 2.
3. Look at the second drawing: it says the path "Not walked yet" has no steps, and there is no Play button for it.

**Checklist line:**

> **T-03** Rename one stepped thing: the problem names the step and offers Remove the step; pressing it renumbers the later steps. A Path with no STEP shows "the path … has no steps" and no Play.

**Back to the checklist:** [T-03 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for T-03 in its list.
