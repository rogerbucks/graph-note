# C-02 Strictness levels

**You should see:** this block, which misses a comma at the end of two lines, read three ways. With Strictness Standard, an error (a cross) behind the badge, and the graph still drawn. With Forgiving, the default, a warning sign. With Simplified and "A missing comma" switched on, no problem at all. The reader's default reading of the block is a warning, as below.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'})
(small:Option {name: 'Small reader'})
(small)-[:ANSWERS]->(question)
```

<!-- expect: problem "a comma is missing at the end of this line" -->

**Do this:**

1. In Settings, Thoughtknot, set Strictness to Standard. Look at the badge: errors, with a cross, and the graph still drawn.
2. Set it to Forgiving. The badge shows warnings.
3. Set it to Simplified and switch "A missing comma" on. The badge shows no problem.

**Checklist line:**

> **C-02** Strictness Standard: a block missing a comma at a line's end shows it as an error (✖) behind the badge, and is still drawn. Forgiving (the default): a warning (⚠). Simplified with "A missing comma" on: no problem at all.

**Back to the checklist:** [C-02 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for C-02 in its list.
