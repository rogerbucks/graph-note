# W-03 Look with colour

**You should see:** in the view called outdoors, the Places drawn in green, readable in the light and the dark theme, and the legend showing a green swatch with the words "open air".

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

The view, and the look it is given.

```gql
// graph: trip · QUERY view outdoors
MATCH (n IS Place) RETURN n
```

```gql
// graph: trip_style · STYLE trip
(green_places:Look {view: 'outdoors', kind: 'Place', colour: 'green', means: 'open air'})
```

<!-- expect: clean -->

**Do this:**

1. Look at the outdoors card: Home, The park and The lake should be green.
2. Read the legend: a green swatch and "open air".
3. Switch between the light and dark themes and check the green text is readable in both.

**Checklist line:**

> **W-03** A Look with a colour and its meaning: the thing is drawn in that hue, readable in light and dark, and the legend shows the swatch and the words (styled_paths_and_views, styling_keeps_locked_rules).

**Back to the checklist:** [W-03 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for W-03 in its list.
