# T-01 Record a path

**You should see:** after pressing Record a path and tapping three boxes, each box showing its number at its top left as it is tapped (a box tapped twice shows both numbers). Undo step takes the last one back. After a title and Save path, a Path with STEP links numbered 1 to 3 is written into the text and the card redraws.

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

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. Press Edit here and Record a path.
2. Tap Home, The park and The lake in that order, and check each shows 1, 2 and 3 at its top left.
3. Tap The park again, check it shows two numbers, and press Undo step.
4. Give the path the title "Sunday walk" and press Save path.
5. Check the text now has a Path with STEP links numbered 1, 2 and 3, and the card redraws.

**Checklist line:**

> **T-01** Edit here, press Record a path, tap three boxes: each shows its number at its top left as it is tapped (a box tapped twice shows both). Undo step takes the last back. Give a title and Save path: a Path with STEP 1 to 3 is written; the card redraws.

**Back to the checklist:** [T-01 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for T-01 in its list.
