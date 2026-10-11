# W-02 Five view kinds

**You should see:** each of the five kinds drawing as a view: picked by hand, near a thing, how one reaches another, only some kinds, and a walked path. The query of another shape is refused, and its card names the five shapes. The view of a thing not in the graph says it matches nothing, with a Change the view button, which opens the note at the view.

**Test diagram:**

```gql
// graph: trip · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Cafe {name: 'Cafe'}),
(lake:Place {name: 'The lake'}),
(tour:Path {title: 'Sunday walk'}),
(tour)-[:STEP {seq: 1}]->(home),
(tour)-[:STEP {seq: 2}]->(park),
(tour)-[:STEP {seq: 3}]->(lake),
(home)-[:NEAR]->(park),
(park)-[:NEAR]->(lake),
(park)-[:NEAR]->(cafe)
```

Picked by hand.

```gql
// graph: trip · QUERY view picked_pair
MATCH (n) WHERE n.id IN ['home', 'park'] RETURN n
```

Near a thing.

```gql
// graph: trip · QUERY view round_park
MATCH (n {id: 'park'})-[]-{1,1}(m) RETURN n, m
```

How one reaches another.

```gql
// graph: trip · QUERY view home_to_lake
MATCH p = (a {id: 'home'})-[]->{1,6}(b {id: 'lake'}) RETURN p
```

Only some kinds.

```gql
// graph: trip · QUERY view only_places
MATCH (n IS Place|Person) RETURN n
```

A walked path.

```gql
// graph: trip · QUERY view sunday
MATCH (p:Path {id: 'tour'})-[:STEP]->(n) RETURN p, n
```

A query of another shape, which is refused.

```gql
// graph: trip · QUERY view counting
MATCH (n) RETURN count(n)
```

A view of a thing that is not in the graph, which matches nothing.

```gql
// graph: trip · QUERY view round_nowhere
MATCH (n {id: 'nowhere'})-[]-{1,1}(m) RETURN n, m
```

<!-- expect: clean -->
<!-- expect: refused "A view query has one of five shapes" -->
<!-- expect: view-empty -->

**Do this:**

1. Look at the five cards for the first five views: each should draw the things its words name.
2. Read the card for "counting": it should say it is refused and name the five shapes.
3. Read the card for "round_nowhere": it should say it matches nothing and offer Change the view.
4. Press Change the view and check the note opens at that view's block.

**Checklist line:**

> **W-02** Each of the five kinds draws: picked by hand, near a thing, how one reaches another, only some kinds (`MATCH (n IS Place|Person) RETURN n`), a walked path (five_view_kinds). A query of another shape is refused, the card naming the five shapes (view_profile). A view of a thing not in the graph says it matches nothing, with Change the view, which opens the note at the view (empty_view).

**Back to the checklist:** [W-02 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for W-02 in its list.
