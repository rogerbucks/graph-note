# I-19 Suggested name box

**You should see:** the thing written without a name, `(:Option {name: 'Small reader'})`, drawn under the suggested name, with a dashed outline and "✎ SUGGESTED NAME" under its text, readable and not shown by colour alone. Tapping it opens its details: "✎ Suggested name: small_reader — not written yet". Outside edit mode nothing can be written there. While editing, tapping it selects its pattern in the text, and the details offer "Add the name small_reader". Pressing that writes the name after the (, redraws the box solid and unlabelled, and the warning leaves the problems list. One undo takes the name back out, and the dashed box and the warning return.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large_reader:Option {name: 'Large reader'}),
(:Option {name: 'Small reader'}),
(large_reader)-[:ANSWERS]->(question)
```

<!-- expect: problem "this thing has no name; suggested: small_reader" -->

**Do this:**

1. Look at the drawing, in light and dark, on the desktop and the phone: the Small reader box has a dashed outline and the words "SUGGESTED NAME".
2. Tap it outside edit mode and read the details. Check the note is unchanged.
3. Press Edit here and tap it again; check its pattern is selected in the text and the details offer "Add the name small_reader".
4. Press that button. Check the box turns solid and unlabelled and the warning is gone from the problems list.
5. Press undo once. Check the name goes and the dashed box and the warning return.
6. On the phone, check the button is easy to hit in the sheet.

**Checklist line:**

> **I-19** A thing written without a name (`(:Option {name: 'Small reader'})`), desktop and phone, light and dark: its box is drawn under the suggested name, with a dashed outline and "✎ SUGGESTED NAME" under its text, readable and not shown by colour alone. Tapping it opens its details like any box's: "✎ Suggested name: small_reader — not written yet". Outside edit mode nothing can be written there; the note is unchanged. While editing, tapping it selects `(:Option {name: 'Small reader'})` in the text, and the details offer "Add the name small_reader". Pressing it writes the name after the `(`, the box is redrawn solid and unlabelled, and the warning leaves the problems list. One undo (⌘Z, or the phone's gesture) takes the name back out, and the dashed box and the warning return. Phone: the button is easy to hit in the sheet (slice 2, unnamed_drawn_suggested).

**Back to the checklist:** [I-19 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for I-19 in its list.
