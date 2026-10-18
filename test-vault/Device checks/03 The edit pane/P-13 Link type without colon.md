# P-13 Link type without colon

**You should see:** the link `-[ANSWERS]->`, whose type the graph already has with its colon, drawn as ANSWERS, with a warning whose fix writes the colon. The link `-[FAVOURS]->`, a type the graph has nowhere else, is an error that says to write the type with its colon.

**Test diagram:**

```gql
// graph: reader
(question:Question {title: 'Which device should I read on?'}),
(small:Option {name: 'Small reader'}),
(tablet:Option {name: 'Tablet'}),
(tablet)-[:ANSWERS]->(question),
(small)-[ANSWERS]->(question),
(tablet)-[FAVOURS]->(small)
```

<!-- expect: problem "[ANSWERS] has no colon; it is read as the relationship type ANSWERS" -->
<!-- expect: problem "[FAVOURS] has no colon, and graph reader has no relationship type called FAVOURS" -->

**Do this:**

1. Look at the drawing: the small reader answers the question, as ANSWERS.
2. Open the problems list behind the badge. Press the fix for [ANSWERS] and check the colon is written.
3. Read the error for [FAVOURS], which says to write it with its colon, and fix it by writing `[:FAVOURS]`.

**Checklist line:**

> **P-13** A link type left without its colon is drawn as that type, with a ⚠ whose fix writes the colon. A new type written without its colon is an error that says to write it.

**Back to the checklist:** [P-13 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for P-13 in its list.
