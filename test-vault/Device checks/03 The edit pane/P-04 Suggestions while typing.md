# P-04 Suggestions while typing

**You should see:** as you type a new line in the pane, the names, kinds and relationship types already in the graph offered as suggestions: after `(z:` the kinds Option, Question and Reason; after `-[:` the relationship types ANSWERS and FAVOURS; after `]->(` the names of the things (question, large, small, eyes). On the desktop, Tab takes the first suggestion.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(small:Option {name: 'Small reader'}),
(eyes:Reason {title: 'E-ink is easier on the eyes'}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question),
(eyes)-[:FAVOURS]->(large)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. Press Edit, put the cursor at the end of the last line of the block in the pane, type a comma and a new line, then type `(z:`. Check the kinds Option, Question and Reason are offered.
2. Delete that and type `(eyes)-[:`. Check the relationship types ANSWERS and FAVOURS are offered.
3. Type `FAVOURS]->(` and check the names of the things are offered.
4. On the desktop, press Tab and check it takes the first suggestion.

**Checklist line:**

> **P-04** Names, kinds and relationships already in the graph are suggested while typing. On the desktop, Tab takes the first.

**Back to the checklist:** [P-04 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for P-04 in its list.
