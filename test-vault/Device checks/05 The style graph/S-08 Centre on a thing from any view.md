# S-08 Centre on a thing from any view

**You should see:** a right-click on a box opens a menu with Centre here, in any view where a radial drawing fits. Picking it draws the graph radial around that box, the boxes gliding out into rings. The strip says the centre and how to pick another. With a box selected, Diagram type offers "Radial, around …". In reading view it is only looked at, never saved.

**Test diagram:**

```gql
// graph: planets · SOURCE
(sun:Thing {name: 'Sun'}),
(earth:Thing {name: 'Earth'}),
(mars:Thing {name: 'Mars'}),
(moon:Thing {name: 'The moon'}),
(earth)-[:CIRCLES]->(sun),
(mars)-[:CIRCLES]->(sun),
(moon)-[:CIRCLES]->(earth)
```

<!-- expect: clean -->

**Do this:**

1. In Live Preview, right-click Earth's box. A small menu opens beside the pointer, saying Centre here.
2. Press Escape: the menu closes and the focus goes back to Earth's box.
3. Right-click Earth again and pick Centre here. The boxes glide out into rings around Earth. The strip says "Centred on Earth." and how to put another thing in the centre.
4. Tab to Mars's box and press Shift+F10: the same menu opens. Press Enter: Mars goes in the centre.
5. Select The moon, then open Diagram type. The Radial tile says "Radial, around The moon". Pick it: The moon goes in the centre.
6. On a phone or tablet, tap Sun and press Centre here in its details. Holding a finger on a box still opens its tooltip, never the menu.
7. In reading view, right-click Earth and pick Centre here. It is drawn around Earth and says "Just looking: not saved."
8. Run `scripts/reset-test-vault.mjs` afterwards, to put the note back.

**Checklist line:**

> **S-08** In a network, right-click a box: a menu says Centre here. Pick it: the boxes glide out into rings around that box. The strip says "Centred on …" and how to pick another. Select a box, open Diagram type: the tile says "Radial, around …". On a phone, tap a box and press Centre here in its details. In reading view each is only looked at.

**Back to the checklist:** [S-08 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for S-08 in its list.
