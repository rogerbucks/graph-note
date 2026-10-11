# V-06 Misspelt link dashed

**You should see:** the link to "small_reeder" drawn as a dashed line to the Small reader, labelled with a warning sign, FAVOURS and "(estimated)". Tapping it explains in one sentence that the name was not found and was read as small_reader.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(small_reader:Option {name: 'Small reader'}),
(easy_on_eyes:Reason {title: 'E-ink is easier on the eyes'}),
(large)-[:ANSWERS]->(question),
(small_reader)-[:ANSWERS]->(question),
(easy_on_eyes)-[:FAVOURS]->(large),
(easy_on_eyes)-[:FAVOURS]->(small_reeder)
```

<!-- expect: problem "small_reeder is not in graph reader" -->

**Do this:**

1. Find the dashed link from "E-ink is easier on the eyes".
2. Read its label.
3. Tap it and read the sentence that appears.

**Checklist line:**

> **V-06** The misspelt link is drawn dashed, labelled "⚠ … (estimated)". Tapping it explains it in one sentence.

**Back to the checklist:** [V-06 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for V-06 in its list.
