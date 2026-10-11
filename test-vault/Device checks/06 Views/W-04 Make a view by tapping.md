# W-04 Make a view by tapping

**You should see:** after tapping two boxes, the strip saying "The view: A and B, picked by hand." Switching to Near a thing, tapping one box and choosing 2 steps gives its reading; the same for How one reaches another with two boxes and Only some kinds with one. Naming it and pressing Write the view adds a view block after the graph, and the new view draws. On the phone every control is easy to hit.

**Test diagram:**

```gql
// graph: trip · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Cafe {name: 'Cafe'}),
(lake:Place {name: 'The lake'}),
(home)-[:NEAR]->(park),
(park)-[:NEAR]->(lake),
(park)-[:NEAR]->(cafe)
```

<!-- expect: clean -->

**Do this:**

1. Press Edit here, then Make a view.
2. Tap Home and The park. Read the strip: "The view: Home and The park, picked by hand."
3. Switch to Near a thing, tap The park, choose 2 steps. Read the strip.
4. Switch to How one reaches another and tap Home, then The lake.
5. Switch to Only some kinds and tap Cafe.
6. Name the view, press Write the view, and check a view block appears after the graph and draws.
7. On the phone, check every control is easy to hit.

**Checklist line:**

> **W-04** Edit here, Make a view: tap two boxes; the strip says "The view: A and B, picked by hand." Switch to Near a thing, tap one, choose 2 steps; then How one reaches another, tap two; then Only some kinds, tap one. Name it and Write the view: a view block appears after the graph, and draws (slice 2, views_by_tapping). Phone: every control easy to hit.

**Back to the checklist:** [W-04 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for W-04 in its list.
