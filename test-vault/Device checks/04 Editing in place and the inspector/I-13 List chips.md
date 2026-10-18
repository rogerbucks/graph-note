# I-13 List chips

**You should see:** the tags of the Small reader as chips that look as a note's list property looks in the Properties panel, light and dark. The x on a chip removes it: the link goes, and the thing too when nothing else links to it, and a line under the rows says which. The add field adds a value on Enter or when left; an empty value, or one already there, says why and writes nothing. On the phone the chips, their x and the add field are easy to hit in the sheet, and the keyboard does not cover the field.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(small:Option {name: 'Small reader'}),
(large:Option {name: 'Large reader'}),
(quiet:Tag {name: 'quiet'}),
(cheap:Tag {name: 'cheap'}),
(small)-[:ANSWERS]->(question),
(large)-[:ANSWERS]->(question),
(small)-[:HAS_TAG]->(quiet),
(small)-[:HAS_TAG]->(cheap),
(large)-[:HAS_TAG]->(quiet)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. Press Edit here and tap the Small reader box; the tags show as chips (quiet, cheap).
2. Compare their look with a list property in a note's Properties panel, light and dark.
3. Press the x on cheap: its link and the Tag thing go (nothing else links to it). Undo, then press the x on quiet: only the link goes, because the Large reader links to it too. Read the line under the rows each time.
4. Type `light` in the add field and press Enter; type nothing and press Enter; type `quiet` again.
5. On the phone, check each chip, x and the add field is easy to hit and the keyboard does not cover the field.

**Checklist line:**

> **I-13** A list's chips look as a note's list property looks in the Properties panel in this theme, light and dark.
>
> - The x on a chip removes it: the link goes, and the thing too when nothing else links to it. A line under the rows says which.
> - The add field adds a value on Enter, or when it is left. An empty value, or one already there, says why and writes nothing.
> - Phone: the chips, their x and the add field are easy to hit in the sheet. The keyboard does not cover the field being typed in.

**Back to the checklist:** [I-13 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for I-13 in its list.
