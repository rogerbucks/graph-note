# V-06 Misspelt link dashed

**You should see:** the link from "E-ink is easier on the eyes" to the misspelt small_reeder drawn as a dashed blue line to the Small reader, labelled `⚠ favours (estimated)`, with a pointing hand over it on the desktop. Tapping or clicking it selects it, drawn heavier as any chosen link is, and shows the heading "⚠ Estimated link" with the note "a guess, not written", and this, in three sentences: `Line 16 links to small_reeder, which is not in graph reader. It was taken to mean small_reader, one letter away. To fix it, change small_reeder to small_reader.` Under it are two buttons. Edit the link opens the editor in the card with small_reeder selected, and the fix bar under the text offers "Change small_reeder to small_reader". The quick fix, "Change small_reeder to small_reader", writes small_reader into the block: the card redraws with a plain solid link and no problem.

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

0. Open this note in Live Preview (not reading view): reading view hides the Edit buttons, and the quick fix with them.
1. Find the dashed link from "E-ink is easier on the eyes" to the Small reader, and read its label.
2. Tap or click it. Check it is drawn heavier, and read the heading, the note and the sentence that appear.
3. Press Edit the link. Check the editor opens with small_reeder selected, and the fix bar offers the fix. Press Done.
4. Tap the link again and press "Change small_reeder to small_reader". Check the card redraws with a solid link and no problem.
5. Run `scripts/reset-test-vault.mjs` afterwards, so the misspelling is back for the next check.

**Checklist line:**

> **V-06** The misspelt link is drawn dashed, labelled "⚠ … (estimated)". Tapping or clicking it selects it and draws it heavier. It is explained in one sentence, with two buttons. The quick fix "Change … to …" writes the name it was taken to mean. Edit the link opens the editor with the misspelt name selected.

**Back to the checklist:** [V-06 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for V-06 in its list.
