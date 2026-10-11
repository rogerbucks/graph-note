# X-06 Android saves in vault

**You should see:** on an Android phone that cannot share a file, the export saved in the vault, with a notice that says so and names the file. If no Android phone is to hand, this check is skipped and left unticked.

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

1. On an Android phone, press Export on the card and press Export it.
2. Read the notice: it should say the export was saved in the vault, and name the file.
3. Find the file in the vault.

**Checklist line:**

> **X-06** Android, if one is to hand: a phone that cannot share a file saves the export in the vault and says so.

**Back to the checklist:** [X-06 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for X-06 in its list.
