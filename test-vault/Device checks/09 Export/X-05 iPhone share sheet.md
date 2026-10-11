# X-05 iPhone share sheet

**You should see:** on the iPhone, Export it followed by Share opening the share sheet with the image, for PNG and for SVG alike. Closing the sheet without sharing shows "Not shared", and nothing is saved in the vault.

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

1. On the iPhone, press Export on the card, choose PNG, and press Export it, then Share.
2. Check the share sheet opens with the image.
3. Close the sheet without sharing. Check the notice says "Not shared" and no new file is in the vault.
4. Repeat with SVG.

**Checklist line:**

> **X-05** iPhone: Export it, then Share: the share sheet opens with the image, PNG and SVG both (slice 2, export_share_sheet). Close the sheet without sharing: "Not shared", and nothing is saved in the vault.

**Back to the checklist:** [X-05 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for X-05 in its list.
