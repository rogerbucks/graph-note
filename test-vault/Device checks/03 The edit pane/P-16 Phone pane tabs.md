# P-16 Phone pane tabs

**You should see:** on the phone, the pane offering Drawing and Text as two tabs, with the problems in a sheet at the bottom. Every button is big enough for a thumb, and nothing needs a hover. The misspelt link below gives the sheet a problem to hold.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(small:Option {name: 'Small reader'}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question),
(large)-[:RIVALS]->(smal)
```

<!-- expect: problem "smal is not in graph reader" -->

**Do this:**

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. On the phone, press Edit.
2. Switch between the Drawing tab and the Text tab.
3. Open the problems sheet at the bottom and press its fix.
4. Check each button is easy to hit with a thumb, and that you never needed to hover.

**Checklist line:**

> **P-16** Phone: the pane offers Drawing and Text as two tabs, with problems in a sheet at the bottom. Every button is easy to hit with a thumb, and nothing needs a hover.

**Back to the checklist:** [P-16 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for P-16 in its list.
