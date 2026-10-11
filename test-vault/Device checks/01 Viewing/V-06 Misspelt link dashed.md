# V-06 Misspelt link dashed

**You should see:** the link from "E-ink is easier on the eyes" to the misspelt small_reeder drawn as a dashed blue line to the Small reader, labelled `⚠ favours (estimated)`. Tapping it shows the heading "⚠ Estimated link" with the note "a guess, not written", and this, in three sentences: `Line 16 links to small_reeder, which is not in graph reader. It was taken to mean small_reader, one letter away. To fix it, change small_reeder to small_reader.`

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
<!-- expect: label "⚠ favours (estimated)" -->
<!-- expect: tap "Line 16 links to small_reeder, which is not in graph reader. It was taken to mean small_reader, one letter away. To fix it, change small_reeder to small_reader." -->

**Do this:**

1. Find the dashed link from "E-ink is easier on the eyes" to the Small reader.
2. Read its label.
3. Tap it and read the heading, the note and the sentence that appear.

**Checklist line:**

> **V-06** The misspelt link is drawn dashed, labelled "⚠ … (estimated)". Tapping it explains it in one sentence.

**Back to the checklist:** [V-06 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for V-06 in its list.
