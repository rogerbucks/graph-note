# H-03 Attachments at a glance

**You should see:** Once an image named photo.png and a PDF named report.pdf are in the vault, the Plan box carries a small paperclip and the number 2 at its top left; the Site box has none. VoiceOver reads the Plan box with "2 attachments". Plan's details list both under Attachments (2), by name and type, and tapping one opens it in Obsidian.

**Test diagram:**

```gql
// graph: attachments · SOURCE
(plan:Doc {name: 'Plan', files: '![[photo.png]] and [[report.pdf]]', see: '[[Sample graph note]]'}),
(site:Place {name: 'Site'}),
(plan)-[:NEAR]->(site)
```

<!-- expect: clean -->

**Do this:**

1. Drag any image into the vault's root and name it photo.png; drag any PDF there and name it report.pdf. On the iPhone, save them to the vault's folder from the Files app.
2. Open this note again: the Plan box has a paperclip and 2 at its top left.
3. With VoiceOver on, move to the Plan box: it is read with "2 attachments".
4. Tap Plan: Attachments (2) lists "photo.png — image" and "report.pdf — PDF". Tap report.pdf: Obsidian opens it.

**Checklist line:**

> **H-03** With photo.png and report.pdf in the vault, the box that links both carries a paperclip and 2 at its top
> left, and VoiceOver reads "2 attachments" with its name. Its details list them under Attachments (2), as "photo.png —
> image" and "report.pdf — PDF"; tap one and Obsidian opens it.

**Back to the checklist:** [H-03 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for H-03 in its list.
