# L-05 Export as an animated SVG

**You should see:** the Export form opening on "Path Sunday walk, played as an animated SVG", with SVG chosen and the pace it was playing at. The file it writes, opened in a browser such as Safari or Chrome, plays the walk round and round: a heavier outline moves from Home to The park, The lake and Cafe, and a dot runs along each link between two steps that a link joins. Every step is numbered on its thing, and the frame's title says "trip · path Sunday walk", with the walk in order and its pace beneath.

**Test diagram:**

```gql
// graph: trip · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(lake:Place {name: 'The lake'}),
(cafe:Cafe {name: 'Cafe'}),
(home)-[:NEAR]->(park),
(park)-[:NEAR]->(lake),
(cafe)-[:SERVES]->(park),
(tour:Path {title: 'Sunday walk'}),
(tour)-[:STEP {seq: 1}]->(home),
(tour)-[:STEP {seq: 2}]->(park),
(tour)-[:STEP {seq: 3}]->(lake),
(tour)-[:STEP {seq: 4}]->(cafe)
```

<!-- expect: clean -->

**Do this:**

1. Press Play Sunday walk, choose 1 second a step under Pace, then press Export as an animated SVG.
2. Check the form: Path Sunday walk, played as an animated SVG; SVG; 1 second a step.
3. Press Export it. Find the file next to the note and open it in a browser: it plays round and round, four seconds a round.
4. Check each step's number on its box, the dot between Home and The park and between The park and The lake, and the frame's title, walk and pace.
5. Open the same file in Finder's Quick Look: it may be still, and still says the walk in order.

**Checklist line:**

> **L-05** While it plays, press Export as an animated SVG: the Export form opens on the path, SVG chosen, at the pace it was playing. Export it: opened in a browser, the image plays round and round, the outline moving from step to step and a dot along a link between two steps; every step is numbered on its thing, and the frame says the walk in order and its pace. Nothing else needs to be installed.

**Back to the checklist:** [L-05 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for L-05 in its list.
