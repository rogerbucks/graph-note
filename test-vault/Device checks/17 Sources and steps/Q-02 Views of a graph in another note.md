# Q-02 Views of a graph in another note

**You should see:** the trip graph of Q-01 drawn here, although none of it is written here. The first card draws the whole graph, read-only, and the second draws everything within one step of The park. Each card has a line saying "Drawn from the note Q-01 Two views of one graph" with an Open button, which opens that note. When the graph is changed in Q-01, both cards here draw the change.

**Test diagram:**

The whole graph, drawn from Q-01.

```gql
// graph: trip · FROM [[Q-01 Two views of one graph]]
```

A view of it, drawn from Q-01 too.

```gql
// graph: trip · QUERY view round_park
MATCH (n {id: 'park'})-[]-{1,1}(m) RETURN n, m
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview, with the cursor outside the blocks.
1. Check the first card draws Home, The park, Cafe and The lake, with no Edit here on its bar, under a line saying it is drawn from the note Q-01 Two views of one graph.
2. Check the second card reads "everything within 1 step of The park" and carries the same line.
3. Press Open on either line. Check Q-01 opens.
4. In Q-01, change `'The park'` to `'The big park'`, then come back here. Check both cards say The big park.
5. Check this note still holds only the two blocks above: nothing of the graph has been copied here.
6. Change the name in Q-01 back.

**Checklist line:**

> **Q-02** A note whose block says `// graph: trip · FROM [[…]]`, naming the note of Q-01, with a view under it: the FROM block draws the whole graph of Q-01, read-only, and the view draws its part, each under a line saying "Drawn from the note …" with an Open button that opens Q-01. Change a name in Q-01's graph block and come back: both cards draw the new name, and this note still holds none of the data.

**Back to the checklist:** [Q-02 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for Q-02 in its list.
