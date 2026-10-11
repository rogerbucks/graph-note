# P-11 Thing without name or text

**You should see:** the thing with text but no name, `(:Option {name: 'Small reader'})`, drawn, with a warning naming the suggested name small_reader, in the style of the names already in the graph (snake case) and not one of them. Its fix puts the name after the ( and the warning goes. The thing with a name but no text, `(large_reader:Option)`, shows an info hint, not counted on the badge, suggesting the text 'Large reader'; its fix adds `{name: 'Large reader'}`. Nothing is written until a fix is pressed.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large_reader:Option),
(:Option {name: 'Small reader'}),
(large_reader)-[:ANSWERS]->(question)
```

<!-- expect: problem "this thing has no name; suggested: small_reader" -->
<!-- expect: hint "the thing large_reader has no text; suggested: 'Large reader'" -->

**Do this:**

1. Press Edit and look at the line `(:Option {name: 'Small reader'})` for the warning, and read the name it suggests.
2. Press its fix and check the name is written after the ( and the warning goes.
3. Look at the line `(large_reader:Option)` for the hint, check the badge does not count it, and press its fix.
4. Check nothing in the text changed before you pressed a fix.

**Checklist line:**

> **P-11** A thing given text but no name, such as `(:Option {name: 'Large reader'})`, is drawn, and shows a ⚠ naming the suggested name, in the style of the names already in the graph and not one of them. Its fix puts the name after the (, and the ⚠ goes. A thing given a name but no text, such as `(large_reader:Option)`, shows an ℹ hint, not counted on the badge, with the text suggested from the name; its fix adds `{name: 'Large reader'}`. Nothing is written until the fix is pressed.

**Back to the checklist:** [P-11 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for P-11 in its list.
