# S-02 Broken nudge word

**You should see:** with the nudge word `besides` (not one of the four words), the style block's fold saying "⚠ 1 problem" and the graph's badge listing "a nudge must be one of four words…". The graph is still drawn. When you break the block's text instead, the graph is drawn in the locked style and the problem is listed.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(small:Option {name: 'Small reader'}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question)
```

```gql
// graph: reader_style · STYLE reader
(direction:Nudge {word: 'direction', direction: 'TB'}),
(side_by_side:Nudge {word: 'besides', thing: 'large', other: 'small'})
```

<!-- expect: problem "a nudge must be one of four words" -->

**Do this:**

1. Read the fold under the graph: "⚠ 1 problem". Open the problems behind the graph's badge and read the nudge message.
2. Check the graph is still drawn.
3. Change `besides` back to `beside`; the problem goes.
4. Now break the block's text, for example delete a closing `)`. Check the graph is drawn in the locked style and the problem is listed.

**Checklist line:**

> **S-02** Change a nudge's word to `besides`: the fold says "⚠ 1 problem"; the graph's badge lists "a nudge must be one of four words…" and the graph is still drawn (four_nudge_words, nudge_problems). Break the block's text: the graph is drawn in the locked style and the problem listed (broken_style_block).

**Back to the checklist:** [S-02 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for S-02 in its list.
