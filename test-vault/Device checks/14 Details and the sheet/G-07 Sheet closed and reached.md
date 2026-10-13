# G-07 Sheet closed and reached

**You should see:** The sheet closes, and the selection clears with it, by its x, by Escape while it or the drawing has the keyboard focus, and by a tap on empty space in the drawing. With the sheet open, clicking into the note's text and typing works as always: Escape, Enter and the arrow keys all reach the note, and none of them closes the sheet. With VoiceOver the sheet's two buttons are read as "Minimise details" (or "Restore details") and "Close details", and Tab reaches both; each is at least a fingertip wide on the phone.

**Test diagram:**

```gql
// graph: shelf · SOURCE
(lamp:Item {name: 'Lamp'}),
(desk:Item {name: 'Desk'}),
(chair:Item {name: 'Chair'}),
(lamp)-[:NEAR]->(desk),
(desk)-[:NEAR]->(chair)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview, with the cursor outside the graph block.
1. Tap Desk, then press the x: the sheet closes and Desk is no longer selected.
2. Tap Desk, then press Escape: the sheet closes. Tap Desk, then tap empty space in the drawing: it closes.
3. Tap Desk, then click into this paragraph's text and type a word, press Enter, the arrow keys and Escape: each reaches the note, and the sheet stays open.
4. With VoiceOver on, tap Desk and swipe through the sheet's header: check both buttons are named, and Tab reaches both from a keyboard.

A line to type in, after this colon:

**Checklist line:**

> **G-07** Close the sheet with its x, with Escape, and by tapping empty space in the drawing: each closes it and clears
> the selection. In Live Preview, with the sheet open, click into the note's text and type, Escape and the arrow
> keys included: every key reaches the note. With VoiceOver, the arrow and the x are read as "Minimise details" and
> "Close details", and Tab reaches both.

**Back to the checklist:** [G-07 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for G-07 in its list.
