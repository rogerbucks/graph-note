# V-08 Tap beside a box

**You should see:** a tap just beside a box or a link, not on it, still chooses it. Where several are near, tapping again in the same place chooses the next one, and after the last it comes round to the first. Two quick taps near things never zoom.

**Test diagram:**

```gql
// graph: crowd · SOURCE
(a:Thing {name: 'A'}),
(b:Thing {name: 'B'}),
(c:Thing {name: 'C'}),
(d:Thing {name: 'D'}),
(a)-[:NEAR]->(b),
(b)-[:NEAR]->(c),
(c)-[:NEAR]->(d),
(a)-[:NEAR]->(d)
```

<!-- expect: clean -->

**Do this:**

1. Tap a little to the side of box B, off the box.
2. Tap again in the same place and watch the choice move to the next near thing, and round to the first.
3. Tap twice quickly near a box and check the drawing does not zoom.

**Checklist line:**

> **V-08** Tapping just beside a box or a link, not on it, still chooses it. Where several are near, tapping again in the same place chooses the next, round to the first, and two quick taps near things never zoom.

**Back to the checklist:** [V-08 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for V-08 in its list.
