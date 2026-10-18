# T-01 Record a path

**You should see:** after pressing Record a path and tapping three boxes, each box showing its number at its top left as it is tapped (a box tapped twice shows both numbers). Undo step takes the last one back. After a title and Save path, a Path with STEP links numbered 1 to 3 is written into the text and the card redraws. A path through a box drawn under a suggested name is refused with "accept its name first", and nothing is written.

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
6. A box drawn under a suggested name cannot be a step until its name is written: try it on the diagram of I-19, and check Save path says "accept its name first" and the text is unchanged.

**Checklist line:**

> **T-01** Edit here, press Record a path, tap three boxes. Each shows its number at its top left as it is tapped (a box tapped twice shows both). Undo step takes the last back.
>
> - Give a title and Save path: a Path with STEP 1 to 3 is written; the card redraws.
> - A path through a box drawn under a suggested name (I-19) is refused with "accept its name first". Nothing is written.

**Back to the checklist:** [T-01 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for T-01 in its list.
