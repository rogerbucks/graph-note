# G-04 Arrow to the selection

**You should see:** With a box selected and the drawing zoomed in until that box is out of sight, a round arrow appears at the edge of the drawing, on the side where the box is, pointing towards it. VoiceOver reads it as "Bring Shed into view". Tapping the arrow brings the box back into view, at the same zoom, and the arrow goes. Tapping the arrow never clears the selection, as a tap on empty space would. Clearing the selection with Escape takes the arrow away too.

**Test diagram:**

```gql
// graph: shelf · SOURCE
(lamp:Item {name: 'Lamp'}),
(desk:Item {name: 'Desk'}),
(chair:Item {name: 'Chair'}),
(rug:Item {name: 'Rug'}),
(shed:Item {name: 'Shed'}),
(lamp)-[:NEAR]->(desk),
(desk)-[:NEAR]->(chair),
(chair)-[:NEAR]->(rug),
(rug)-[:NEAR]->(shed)
```

<!-- expect: clean -->

**Do this:**

1. Tap Shed.
2. Zoom in with the plus button until Shed is out of sight. Check an arrow at the edge points towards it.
3. Pan a little: check the arrow moves along the edge to keep pointing at Shed.
4. Tap the arrow. Check Shed is back in view, still selected, and the arrow has gone.

**Checklist line:**

> **G-04** Select a box, then zoom in until it is out of sight: a round arrow at the edge of the drawing points to it.
> Tap the arrow: the box comes back into view and the arrow goes.

**Back to the checklist:** [G-04 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for G-04 in its list.
