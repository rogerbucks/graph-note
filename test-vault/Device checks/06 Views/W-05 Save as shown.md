# W-05 Save as shown

**You should see:** after zooming in, selecting a box and pressing Save as shown, the style block gaining a Shown thing. When the note is closed and reopened, the view opens at that zoom, with that box's details open.

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

```gql
// graph: trip · QUERY view round_park
MATCH (n {id: 'park'})-[]-{1,1}(m) RETURN n, m
```

<!-- expect: clean -->

**Do this:**

1. Zoom in on the round_park card, and tap The park so its details open.
2. Press Save as shown.
3. Open the note's text: a style block with a Shown thing (zoom, position, selected: 'park') should be there.
4. Close the note and open it again. The view should open at that zoom with The park's details open.

**Checklist line:**

> **W-05** Zoom in, select a box, Save as shown: the style block gets a Shown; close and reopen the note: the view opens at that zoom with that box's details open (view_saved_as_shown).

**Back to the checklist:** [W-05 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for W-05 in its list.
