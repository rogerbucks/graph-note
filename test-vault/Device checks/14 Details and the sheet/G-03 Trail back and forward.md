# G-03 Trail back and forward

**You should see:** After choosing things one after another from the details, a Back button and, once you have gone back, a Forward button sit at the top of the details, each named for where it goes: "Back to Desk", "Forward to Rug". Each press selects that thing again, opens its details and brings it into view, so a walk through the graph can be retraced step by step. Tapping a box in the drawing itself starts a new trail, and the buttons go until something is chosen from the details again.

**Test diagram:**

```gql
// graph: shelf · SOURCE
(lamp:Item {name: 'Lamp'}),
(desk:Item {name: 'Desk'}),
(chair:Item {name: 'Chair'}),
(rug:Item {name: 'Rug'}),
(lamp)-[:NEAR]->(desk),
(desk)-[:NEAR]->(chair),
(chair)-[:NEAR]->(rug)
```

<!-- expect: clean -->

**Do this:**

1. Tap Lamp. In its details tap Desk, then in Desk's tap Chair, then in Chair's tap Rug.
2. Press Back twice: check you are at Chair, then Desk.
3. Press Forward once: check you are at Chair again.
4. Tap Lamp in the drawing: check the Back and Forward buttons are gone.

**Checklist line:**

> **G-03** Choose three things in turn from the details, then press Back twice and Forward once: each step returns to
> the thing it names, and tapping a box in the drawing starts the trail again.

**Back to the checklist:** [G-03 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for G-03 in its list.
