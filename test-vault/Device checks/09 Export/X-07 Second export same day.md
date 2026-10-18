# X-07 Second export same day

**You should see:** a second export of the same graph on one day saved under the name with -2 before the .svg, the first file kept as it was, and a notice that says so.

**Test diagram:**

```gql
// graph: trip · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(lake:Place {name: 'The lake'}),
(home)-[:NEAR]->(park),
(park)-[:NEAR]->(lake)
```

<!-- expect: clean -->

**Do this:**

1. Export the graph as SVG.
2. Export it again as SVG straight away.
3. Check the vault holds both files, the second ending -2.svg, and the notice said the first was kept.

**Checklist line:**

> **X-07** Export the same graph twice on one day: the second is saved as `…-2.svg`, the first kept, and the notice says so.

**Back to the checklist:** [X-07 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for X-07 in its list.
