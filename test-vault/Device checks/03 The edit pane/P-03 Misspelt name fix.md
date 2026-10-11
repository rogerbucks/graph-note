# P-03 Misspelt name fix

**You should see:** the misspelt name small_reeder underlined in the pane with a warning sign. The fix, change small_reeder to small_reader, is offered on that line, and pressing it corrects the text and clears the warning. The graph below starts misspelt, as the pane would after you typed the typo.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(small_reader:Option {name: 'Small reader'}),
(eyes:Reason {title: 'E-ink is easier on the eyes'}),
(small_reader)-[:ANSWERS]->(question),
(eyes)-[:FAVOURS]->(small_reeder)
```

<!-- expect: problem "small_reeder is not in graph reader" -->

**Do this:**

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. Press Edit to open the pane.
2. Find the underline on small_reeder and the warning beside it.
3. Press the fix offered on that line.
4. Check the text now says small_reader and the warning is gone.

**Checklist line:**

> **P-03** Typing a misspelt name underlines it with a ⚠. Its fix is offered on that line, and pressing it fixes the text.

**Back to the checklist:** [P-03 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for P-03 in its list.
