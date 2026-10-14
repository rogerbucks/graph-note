# L-01 Dashes for one type

**You should see:** the two NEAR links drawn dashed, the dashes running along each line in the direction of its arrow, and each NEAR label opening with ⇢. The SERVES link is still, with no icon. Under the bar, a legend says "⇢ moving dashes: people walk this way". Once the Flow is taken out of the style block, every link is still and drawn as usual, and the legend is gone.

**Test diagram:**

```gql
// graph: trip · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(lake:Place {name: 'The lake'}),
(cafe:Cafe {name: 'Cafe'}),
(home)-[:NEAR]->(park),
(park)-[:NEAR]->(lake),
(cafe)-[:SERVES]->(park)
```

The style block: the NEAR links move as dashes, and say what the movement means.

```gql
// graph: trip_style · STYLE trip
(f1:Flow {motion: 'dashes', type: 'NEAR', means: 'people walk this way'})
```

<!-- expect: clean -->

**Do this:**

1. Look at the drawing: the dashes run along both NEAR links, towards their arrowheads; the SERVES link stands still.
2. Read each NEAR label: it opens with ⇢. The SERVES label has no icon.
3. Read the legend under the bar: "⇢ moving dashes: people walk this way".
4. In the note's text, delete the Flow line from the style block, leaving the block's first line: every link is still and the legend goes.
5. Put the Flow line back, to leave the note as it was.

**Checklist line:**

> **L-01** A graph whose style block holds a Flow with dashes for one relationship type: the dashes run along each of its links, in the direction of its arrow, and each of its labels opens with ⇢; the other links are still. Under the bar the legend says "⇢ moving dashes:" and what the movement means. Take the Flow out of the style block: every link is still and the legend goes.

**Back to the checklist:** [L-01 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for L-01 in its list.
