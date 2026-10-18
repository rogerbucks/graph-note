# I-03 Text box height

**You should see:** in the card, the text box exactly as tall as its text plus one more line, with no empty area below for the caret to land in. Each read-back sits at the right of its own line and never wraps under it. Typing lands where the text shows.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read long PDFs on?'}),
(large:Option {name: 'Large e-ink reader'}),
(small:Option {name: 'Small e-ink reader'}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. Press Edit here and look below the last line of text: there should be one empty line, and no more.
2. Tap in the space below the text and check the caret lands on the last line.
3. Look at the read-backs on the right, especially on the longest line: none should wrap under its line.
4. Type on a new line and check the text appears where you typed.

**Checklist line:**

> **I-03** In the card, the text box is as tall as the text and one more line: no empty area below it for the caret to land in. Each read-back sits on its own line's right, never wrapping under it, and typing lands where the text shows.

**Back to the checklist:** [I-03 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for I-03 in its list.
