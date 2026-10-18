# X-04 Companion note and classification

**You should see:** with the companion note setting on, a `.md` file beside the exported image that shows the image and links back to this note. For a note whose classification is above the setting's level, the export form naming that classification and writing nothing until you press Export anyway. This note carries no classification, so you add one by hand for the second part.

**Test diagram:**

```gql
// graph: trip · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(lake:Place {name: 'The lake'}),
(home)-[:NEAR]->(park),
(park)-[:NEAR]->(lake)
```

<!-- expect: clean -->

**Do this:**

1. In Settings, ThoughtKnot, Export, switch the companion note on. Press Export on the card and export. Open the `.md` beside the image: it shows the image and links this note.
2. For the classification part, add front matter to the top of this note with a classification line set to a level above the one in the setting (for example Internal when the setting is Public). Do not commit it: the test vault only commits Public notes, and the vault reset removes it.
3. Press Export. The form should name the classification and write nothing until you press Export anyway.

**Checklist line:**

> **X-04** Settings › Export › companion note on: a `.md` beside the image shows it and links the note. A note with `classification:` above the setting's level: the form names it and writes nothing until Export anyway.

**Back to the checklist:** [X-04 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for X-04 in its list.
