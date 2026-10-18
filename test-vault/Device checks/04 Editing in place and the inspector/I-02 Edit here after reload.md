# I-02 Edit here after reload

**You should see:** straight after the app starts or reloads, and on a card far down this note that you scroll to only then, Edit here opening the editor in that card. Done closes it with what was typed kept in the note. Edit here never does nothing without saying why. Pressed twice quickly, Edit here opens one editor, with the focus in it, never two.

**Test diagram:**

Sixty lines of filler follow, so the graph's card starts well below the first screen. Scroll past them to the block.

Filler line 01, so the card below starts below the fold.

Filler line 02, so the card below starts below the fold.

Filler line 03, so the card below starts below the fold.

Filler line 04, so the card below starts below the fold.

Filler line 05, so the card below starts below the fold.

Filler line 06, so the card below starts below the fold.

Filler line 07, so the card below starts below the fold.

Filler line 08, so the card below starts below the fold.

Filler line 09, so the card below starts below the fold.

Filler line 10, so the card below starts below the fold.

Filler line 11, so the card below starts below the fold.

Filler line 12, so the card below starts below the fold.

Filler line 13, so the card below starts below the fold.

Filler line 14, so the card below starts below the fold.

Filler line 15, so the card below starts below the fold.

Filler line 16, so the card below starts below the fold.

Filler line 17, so the card below starts below the fold.

Filler line 18, so the card below starts below the fold.

Filler line 19, so the card below starts below the fold.

Filler line 20, so the card below starts below the fold.

Filler line 21, so the card below starts below the fold.

Filler line 22, so the card below starts below the fold.

Filler line 23, so the card below starts below the fold.

Filler line 24, so the card below starts below the fold.

Filler line 25, so the card below starts below the fold.

Filler line 26, so the card below starts below the fold.

Filler line 27, so the card below starts below the fold.

Filler line 28, so the card below starts below the fold.

Filler line 29, so the card below starts below the fold.

Filler line 30, so the card below starts below the fold.

Filler line 31, so the card below starts below the fold.

Filler line 32, so the card below starts below the fold.

Filler line 33, so the card below starts below the fold.

Filler line 34, so the card below starts below the fold.

Filler line 35, so the card below starts below the fold.

Filler line 36, so the card below starts below the fold.

Filler line 37, so the card below starts below the fold.

Filler line 38, so the card below starts below the fold.

Filler line 39, so the card below starts below the fold.

Filler line 40, so the card below starts below the fold.

Filler line 41, so the card below starts below the fold.

Filler line 42, so the card below starts below the fold.

Filler line 43, so the card below starts below the fold.

Filler line 44, so the card below starts below the fold.

Filler line 45, so the card below starts below the fold.

Filler line 46, so the card below starts below the fold.

Filler line 47, so the card below starts below the fold.

Filler line 48, so the card below starts below the fold.

Filler line 49, so the card below starts below the fold.

Filler line 50, so the card below starts below the fold.

Filler line 51, so the card below starts below the fold.

Filler line 52, so the card below starts below the fold.

Filler line 53, so the card below starts below the fold.

Filler line 54, so the card below starts below the fold.

Filler line 55, so the card below starts below the fold.

Filler line 56, so the card below starts below the fold.

Filler line 57, so the card below starts below the fold.

Filler line 58, so the card below starts below the fold.

Filler line 59, so the card below starts below the fold.

Filler line 60, so the card below starts below the fold.

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
1. Reload the app (the command palette's Reload app without saving), open this note, and scroll straight down past the filler to the card. Do not press anything first.
2. Press Edit here at once and check the editor opens in the card.
3. Type a word into the text and press Done. Check what you typed is in the note.
4. If Edit here did nothing, check it said why.
5. Reload the app again, scroll to the card, and press Edit here twice quickly (a double click, or two taps). Check one editor opens, with the caret in it, and that one Done closes it.

**Checklist line:**

> **I-02** Straight after the app starts or reloads, and on a card far down a long note scrolled to only then: Edit here opens the editor in that card, and Done closes it with what was typed in the note. Edit here never does nothing without saying why. Pressed twice quickly, it opens one editor, with the focus in it, never two.

**Back to the checklist:** [I-02 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for I-02 in its list.
