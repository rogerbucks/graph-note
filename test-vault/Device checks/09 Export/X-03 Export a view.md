# X-03 Export a view

**You should see:** exporting from the view's card first giving an image of the view alone (The park and what is one step from it), then, with the faded option, an image of the whole graph with everything outside the view faded.

**Test diagram:**

```gql
// graph: trip · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Cafe {name: 'Cafe'}),
(lake:Place {name: 'The lake'}),
(home)-[:NEAR]->(park),
(park)-[:NEAR]->(lake),
(lake)-[:NEAR]->(cafe)
```

```gql
// graph: trip · QUERY view round_park
MATCH (n {id: 'park'})-[]-{1,1}(m) RETURN n, m
```

<!-- expect: clean -->

**Do this:**

1. Press Export on the round_park card and choose the view alone. Export it and open the file: only The park, Home and The lake.
2. Export again, choosing the view with the rest faded. Open the file: the Cafe is there but faded.

**Checklist line:**

> **X-03** On a view's card: the view alone, then with the rest faded.

**Back to the checklist:** [X-03 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for X-03 in its list.
