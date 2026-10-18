# W-01 View card and hide others

**You should see:** the view block drawn as a card that says "View round_park: everything within 1 step of The park", with the things outside the view faded. Hide others writes `outside: 'hide'` into the style block, and the card redraws with only the view.

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

The view.

```gql
// graph: trip · QUERY view round_park
MATCH (n {id: 'park'})-[]-{1,1}(m) RETURN n, m
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. Read the view's card and check its words.
2. Check Lake and Home are drawn and the Cafe, which is two steps away, is faded.
3. Press Hide others and check the Cafe disappears.
4. Open the note's text and check a style block with `outside: 'hide'` has been written.

**Checklist line:**

> **W-01** A view block (`// graph: trip · QUERY view round_park` with `MATCH (n {id: 'park'})-[]-{1,1}(m) RETURN n, m`): its card says "View round_park: everything within 1 step of The park"; the things outside it are faded. Hide others writes `outside: 'hide'` into the style block and the card redraws with only the view.

**Back to the checklist:** [W-01 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for W-01 in its list.
