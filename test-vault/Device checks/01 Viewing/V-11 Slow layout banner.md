# V-11 Slow layout banner

**You should see:** for a graph whose layout runs past five seconds, its text shown with the "took too long" banner and a clock icon, and the next graph below still drawn. The console says nothing about the main thread, because the layout ran in a worker. A small graph cannot take five seconds to lay out, so the one below draws normally on its own; it is the graph to grow, and the second block is the one that must still draw.

**Test diagram:**

```gql
// graph: tangle · SOURCE
(n1:Thing {name: 'N1'}),
(n2:Thing {name: 'N2'}),
(n3:Thing {name: 'N3'}),
(n4:Thing {name: 'N4'}),
(n5:Thing {name: 'N5'}),
(n6:Thing {name: 'N6'}),
(n1)-[:LINKS]->(n2),
(n1)-[:LINKS]->(n3),
(n1)-[:LINKS]->(n4),
(n1)-[:LINKS]->(n5),
(n1)-[:LINKS]->(n6),
(n2)-[:LINKS]->(n3),
(n2)-[:LINKS]->(n4),
(n2)-[:LINKS]->(n5),
(n2)-[:LINKS]->(n6),
(n3)-[:LINKS]->(n4),
(n3)-[:LINKS]->(n5),
(n3)-[:LINKS]->(n6),
(n4)-[:LINKS]->(n5),
(n4)-[:LINKS]->(n6),
(n5)-[:LINKS]->(n6)
```

The graph that must still draw after it.

```gql
// graph: after · SOURCE
(a:Thing {name: 'After A'}),
(b:Thing {name: 'After B'}),
(a)-[:LINKS]->(b)
```

<!-- expect: clean -->

**Do this:**

1. Make the first graph large enough that its layout takes more than five seconds: add things and links in the same pattern, for example every thing linked to every other, until the banner appears. The number needed depends on the device.
2. Read the banner: "took too long" and a clock icon.
3. Check the second graph still draws.
4. Open the developer console and check it says nothing about the main thread.

**Checklist line:**

> **V-11** A graph whose layout runs past five seconds shows its text with the "took too long" banner and a clock icon, and the next graph still draws. The console says nothing about the main thread: the layout ran in a worker (§9).

**Back to the checklist:** [V-11 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for V-11 in its list.
