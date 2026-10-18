# I-05 Typing keeps focus

**You should see:** typing in the card character by character redrawing the drawing without ever taking the focus from the box: the caret, the selection and the scroll position stay put. Typing a comma at a line's end keeps the box in its card. Undo takes back a run of typing at a time, even after redraws. A line added above the block, or taken away, while the card is edited leaves the box in its card, with its selection and its undo history.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(small:Option {name: 'Small reader'}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. Press Edit here, select a word and type over it; check the caret stays in the box.
2. Scroll the box a little, type, and check it stays scrolled.
3. Type a comma at the end of a line and check the box is still in its card.
4. Press Undo (⌘Z, Edit, Undo, or the phone's undo gesture) and check a run of typing is taken back at once.
5. With the box still being edited, select a word in it, then click at the end of the "Test diagram" heading, above the card, and press Return to add a line there. Check the card still shows the box, with the word still selected, and its pencil still shows the book icon. Press Backspace to take the line away again, and check the same. Click back into the box and press Undo: your typing is taken back.

**Checklist line:**

> **I-05** Typing in the card, character by character, redraws the drawing and never takes the focus from the box. The caret, the selection and where it is scrolled stay put.
>
> - Typing a comma at a line's end keeps the box in its card.
> - Undo (⌘Z, or Edit → Undo, or the phone's undo gesture) takes back a run of typing at a time, even after redraws.
> - A line may be added above the block, or taken away, while the card is edited. The box stays in its card, with its selection and its undo history.

**Back to the checklist:** [I-05 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for I-05 in its list.
