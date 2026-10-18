# H-05 Back where you were

**You should see:** After zooming in and selecting the Plan box, following its link to the sample note opens that note in the same tab. Going back with Obsidian's back button, or the back gesture on the iPhone, shows this graph again at the same zoom and in the same place, with Plan still selected and its details still open.

**Test diagram:**

```gql
// graph: back_where · SOURCE
(plan:Doc {name: 'Plan', see: '[[Sample graph note]]'}),
(site:Place {name: 'Site'}),
(road:Place {name: 'Road'}),
(plan)-[:NEAR]->(site),
(site)-[:NEAR]->(road)
```

<!-- expect: clean -->

**Do this:**

1. Press the zoom in button twice, and pan so Plan is near the middle.
2. Tap Plan, then tap Sample graph note under Links: the note opens in this tab.
3. Go back: the graph is at the same zoom and place, Plan is selected and its details are open.

**Checklist line:**

> **H-05** Zoom in, tap a box, then tap a link to a note in its details: the note opens in the same tab. Go back: the graph is at the same zoom and place. The same box is selected, with its details open.

**Back to the checklist:** [H-05 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for H-05 in its list.
