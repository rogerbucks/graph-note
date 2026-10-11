# V-03 Query block as code

**You should see:** the graph block drawn as a picture, and the query block under it shown as coloured code with a copy button, not as a drawing. The query is only text to copy. In Live Preview, point at the query block: Obsidian's own Edit this block icon appears at its top right, and the copy icon sits just to its left. The two icons sit side by side, in a row, and neither covers the other. This holds in a light theme and a dark theme, and on a phone.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(small:Option {name: 'Small reader'}),
(reason:Reason {title: 'E-ink is easier on the eyes'}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question),
(reason)-[:FAVOURS]->(large)
```

A query is shown as code.

```gql
// graph: reader · QUERY
MATCH (r:Reason)-[:FAVOURS]->(o:Option) RETURN o.name, count(r)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): the Edit this block icon belongs to Live Preview.
1. Look at the block under "A query is shown as code". On a phone, tap it first, as there is no pointer to hover with.
2. Check the Edit this block icon and the copy icon at its top right: side by side, neither on top of the other.
3. Press its copy button and paste somewhere to see the text.

**Checklist line:**

> **V-03** The query block shows as coloured code with a copy button, not a drawing.

**Back to the checklist:** [V-03 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for V-03 in its list.
