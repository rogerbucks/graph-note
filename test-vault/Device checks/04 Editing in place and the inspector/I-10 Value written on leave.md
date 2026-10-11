# I-10 Value written on leave

**You should see:** a value written to the note when its field is left. A value that does not fit its type, such as words in the rating, says why and changes nothing in the note.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(small:Option {name: 'Small reader', rating: 4}),
(small)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

1. Press Edit here, tap the Small reader box, and change rating to 5. Leave the field, and check the note's text now says `rating: 5`.
2. Type the word `high` in rating and leave the field.
3. Check a message says the value is not a number, and the note still says `rating: 5`.

**Checklist line:**

> **I-10** A value is written when its field is left; a value that does not fit its type says why, and nothing changes.

**Back to the checklist:** [I-10 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for I-10 in its list.
