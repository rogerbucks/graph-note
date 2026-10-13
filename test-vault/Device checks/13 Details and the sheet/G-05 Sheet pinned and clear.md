# G-05 Sheet pinned and clear

**You should see:** Tapping a box low on the screen opens its details as a sheet pinned to the foot of the screen, over the card and exactly as wide as it, with rounded top corners and a shadow. The drawing moves up so the box tapped sits above the sheet, still inside its card. Scrolling the note leaves the sheet where it is. When the card scrolls off the screen the sheet goes, and it comes back when the card does. Nothing moves when the box tapped is already above the sheet.

**Test diagram:**

```gql
// graph: day · SOURCE
(wake:Step {name: 'Wake'}),
(wash:Step {name: 'Wash'}),
(dress:Step {name: 'Dress'}),
(eat:Step {name: 'Eat'}),
(walk:Step {name: 'Walk'}),
(work:Step {name: 'Work'}),
(lunch:Step {name: 'Lunch'}),
(home:Step {name: 'Home'}),
(read:Step {name: 'Read'}),
(sleep:Step {name: 'Sleep'}),
(wake)-[:THEN]->(wash),
(wash)-[:THEN]->(dress),
(dress)-[:THEN]->(eat),
(eat)-[:THEN]->(walk),
(walk)-[:THEN]->(work),
(work)-[:THEN]->(lunch),
(lunch)-[:THEN]->(home),
(home)-[:THEN]->(read),
(read)-[:THEN]->(sleep)
```

<!-- expect: clean -->

**Do this:**

1. On the iPhone, in reading view, scroll until the lowest boxes of the drawing are near the foot of the screen.
2. Tap the lowest box you can see. Check the sheet opens at the foot of the screen, as wide as the card, and the drawing moves up so the box is above the sheet.
3. Scroll the note up and down a little: check the sheet stays where it is.
4. Scroll until the card is off the screen: check the sheet goes; scroll back and check it returns.
5. Do the same in Live Preview, and on the Mac.

**Checklist line:**

> **G-05** iPhone, reading view and Live Preview, a card taller than the screen: tap a box near the foot of the screen.
> The details open as a sheet at the foot of the screen, over the card and as wide as it, and the drawing moves up
> so the box sits above the sheet. Scroll the note: the sheet stays where it is; scroll the card off the screen: the
> sheet goes, and comes back with the card. Same on the Mac.

**Back to the checklist:** [G-05 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for G-05 in its list.
