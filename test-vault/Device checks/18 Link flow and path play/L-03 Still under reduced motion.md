# L-03 Still under reduced motion

**You should see:** with the system's reduce-motion setting on, nothing in the drawing moves. The NEAR links stay dashed but the dashes stand still, and no dot is drawn on the SERVES link; every label keeps its icon, and the legend under the bar still says what each movement means. Pressing Play Sunday walk marks each step at once, outlined heavier but not pulsing, with no dot running between steps. An animated SVG exported from it, opened in a browser, is still too, with every step outlined and numbered.

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

The style block: dashes on the NEAR links, a dot on the SERVES link.

```gql
// graph: trip_style · STYLE trip
(f1:Flow {motion: 'dashes', type: 'NEAR', means: 'people walk this way'}),
(f2:Flow {motion: 'dot', type: 'SERVES', means: 'coffee goes this way'})
```

<!-- expect: clean -->

**Do this:**

1. Turn the reduce-motion setting on: on the Mac, System Settings › Accessibility › Display › Reduce motion; on the iPhone, Settings › Accessibility › Motion › Reduce Motion.
2. Close and open this note again, so the drawing is drawn afresh: the dashes stand still, and the SERVES link has no dot. The icons and the legend are there.
3. Press Play Sunday walk, then Next step: each step is outlined at once, with no pulse and no dot.
4. Press Export as an animated SVG, then Export it, and open the file in a browser: it is still, every step outlined and numbered, and the frame says the walk in order.
5. Turn the setting off again.

**Checklist line:**

> **L-03** Turn the system's reduce-motion setting on, and redraw the notes of L-01 and L-02. The dashes stand still, no dot is drawn, and the icons and the legend stay. Press Play on a path: each step is marked at once, with no pulse and no dot. Open an exported animated SVG in a browser: it is still, every step outlined and numbered. Turn the setting off again afterwards.

**Back to the checklist:** [L-03 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for L-03 in its list.
