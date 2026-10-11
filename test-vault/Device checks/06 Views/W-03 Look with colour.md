# W-03 Look with colour

**You should see:** on the card of the view called outdoors, the outlines of the three Places, Home, The park and The lake, drawn in green. Only the outline takes the colour: the words in the boxes keep the normal text colour, so they stay readable in the light and the dark theme. The Cafe, which is not a Place, is outside the view, so it is faded and has no green. Under the drawing the legend shows a green swatch beside the words `open air`. A screen reader hears "open air" after the name of each green box.

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

1. Look at the outdoors card: the outlines of Home, The park and The lake should be green.
2. Check the words in those boxes are in the ordinary text colour, not green.
3. Read the legend: a green swatch and `open air`.
4. Switch between the light and dark themes and check the green outline and the words are readable in both.

**Checklist line:**

> **W-03** A Look with a colour and its meaning: the thing is drawn in that hue, readable in light and dark, and the legend shows the swatch and the words.

**Back to the checklist:** [W-03 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for W-03 in its list.
