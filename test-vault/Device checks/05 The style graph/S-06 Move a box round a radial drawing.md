# S-06 Move a box round a radial drawing

**You should see:** in a radial drawing, a box dragged next to another one around the centre goes just before or just after it. The line at the top says "Put … before …" or "Put … after …", never beside, and the centre is never a place. Letting go moves the box round to that place.

**Test diagram:**

```gql
// graph: hub · SOURCE
(sun:Thing {name: 'Sun'}),
(a:Thing {name: 'A'}),
(b:Thing {name: 'B'}),
(c:Thing {name: 'C'}),
(d:Thing {name: 'D'}),
(sun)-[:SEES]->(a),
(sun)-[:SEES]->(b),
(sun)-[:SEES]->(c),
(sun)-[:SEES]->(d)
```

```gql
// graph: hub_style · STYLE hub
(d1:Diagram {type: 'radial'})
```

<!-- expect: clean -->

**Do this:**

1. On a desktop, drag C's box to just past A, going round the centre. Read the line at the top of the drawing.
2. Let go. C is drawn round the centre next to A, on the side you let go.
3. Drag a box onto Sun, in the middle: the line says to let go next to a box, and letting go writes nothing.
4. Run `scripts/reset-test-vault.mjs` afterwards, to take the nudge out again.

**Checklist line:**

> **S-06** In a radial drawing, drag a box to just past another one around the centre. The line says "Put … before …" or "… after …", never beside, and letting go moves the box round to that place.

**Back to the checklist:** [S-06 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for S-06 in its list.
