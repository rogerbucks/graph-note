# G-02 Reduced motion

**You should see:** With the system's reduced motion setting on, choosing a linked thing from the details jumps the drawing straight to it, with no glide at all. With the setting off, the drawing glides there briefly, in about a quarter of a second, and never waits. Either way the box chosen gets the heavy outline and its name heads the details at the moment it is chosen, so the move is never the only sign of where the selection went; with VoiceOver on, the new details are read out.

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
(rug)-[:NEAR]->(shed),
(shed)-[:NEAR]->(lamp)
```

<!-- expect: clean -->

**Do this:**

1. Turn reduced motion on: System Settings › Accessibility › Display › Reduce motion on the Mac, Settings › Accessibility › Motion › Reduce Motion on the iPhone.
2. Zoom in until only Lamp is in sight, tap Lamp, and in its details tap Shed. Check the drawing jumps to Shed with no glide.
3. Turn reduced motion off and do the same from Shed to Rug. Check the drawing glides, briefly.
4. While it glides, check Rug already has the heavy outline and heads the details.

**Checklist line:**

> **G-02** Settings › Accessibility › Reduce motion on the Mac, or Reduce Motion on the iPhone: choosing a linked thing
> jumps straight to it, with no glide. With it off, the glide is brief, and the box is marked selected and named in
> the details as the glide starts.

**Back to the checklist:** [G-02 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for G-02 in its list.
