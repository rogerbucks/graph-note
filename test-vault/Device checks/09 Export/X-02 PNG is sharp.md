# X-02 PNG is sharp

**You should see:** an exported PNG that opens sharp, at twice the drawing's size or more, with the words crisp when you zoom into the file.

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

1. Press Export on the card, choose PNG and press Export it.
2. Open the PNG and check its pixel size is at least twice the drawing's size on screen.
3. Zoom into the file and check the words stay sharp.

**Checklist line:**

> **X-02** PNG: the file opens sharp at twice the drawing's size or more.

**Back to the checklist:** [X-02 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for X-02 in its list.
