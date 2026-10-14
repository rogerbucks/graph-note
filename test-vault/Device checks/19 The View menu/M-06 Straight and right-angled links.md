# M-06 Straight and right-angled links

**You should see:** the first graph's links drawn as straight lines from box to box, its style block saying routing: 'straight'; the second graph's links drawn with right angles only, each label set beside its line, its style block saying routing: 'right-angled'. The third graph's style block misspells the routing: its problems say "stright is not a routing: links are curved, straight or right-angled", with the fix to change it to straight, and it is drawn curved, as with no routing.

**Test diagram:**

```gql
// graph: lines · SOURCE
(a:Place {name: 'Harbour'}), (b:Place {name: 'Market'}), (c:Place {name: 'Station'}), (d:Place {name: 'Park'}),
(a)-[:ROAD_TO]->(b), (a)-[:ROAD_TO]->(c), (b)-[:ROAD_TO]->(d), (c)-[:ROAD_TO]->(d), (a)-[:FERRY_TO]->(d)
```

```gql
// graph: lines_style · STYLE lines
(r1:Links {routing: 'straight'})
```

```gql
// graph: grid · SOURCE
(a:Place {name: 'Harbour'}), (b:Place {name: 'Market'}), (c:Place {name: 'Station'}), (d:Place {name: 'Park'}),
(a)-[:ROAD_TO]->(b), (a)-[:ROAD_TO]->(c), (b)-[:ROAD_TO]->(d), (c)-[:ROAD_TO]->(d), (a)-[:FERRY_TO]->(d)
```

```gql
// graph: grid_style · STYLE grid
(r1:Links {routing: 'right-angled'})
```

```gql
// graph: curves · SOURCE
(a:Place {name: 'Harbour'}), (b:Place {name: 'Market'}),
(a)-[:ROAD_TO]->(b)
```

```gql
// graph: curves_style · STYLE curves
(r1:Links {routing: 'stright'})
```

<!-- expect: problem "stright is not a routing: links are curved, straight or right-angled" -->

**Do this:**

1. Look at the lines graph: every link is a straight line.
2. Look at the grid graph: every link turns only at right angles, and each label sits beside its line.
3. Open the curves graph's problems: one says stright is not a routing, with the fix to change it to straight.
4. Check the curves graph is drawn with its usual curved link.

**Checklist line:**

> **M-06** In the style block, routing: 'straight' draws every link as a straight line, and routing: 'right-angled' as lines with right angles, each reading set beside its line; 'curved' is the drawing as before. A word that is not one of the three is a problem with its fix.

**Back to the checklist:** [M-06 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for M-06 in its list.
