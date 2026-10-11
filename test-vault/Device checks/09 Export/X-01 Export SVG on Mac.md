# X-01 Export SVG on Mac

**You should see:** a file named for the note, the graph and the day, ending .svg, appearing next to this note. Opened outside Obsidian (Finder's Quick Look) it reads the same as the card, with the graph's name, its legend, and "From Export SVG on Mac, exported" and the day. Exported in dark, it has the same content in dark colours.

**Test diagram:**

```gql
// graph: trip · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Cafe {name: 'Cafe'}),
(lake:Place {name: 'The lake'}),
(home)-[:NEAR]->(park),
(park)-[:NEAR]->(lake),
(park)-[:NEAR]->(cafe)
```

<!-- expect: clean -->

**Do this:**

1. On the Mac, press Export on the card.
2. Choose The whole diagram, SVG, Light, and press Export it.
3. Find the new `.svg` beside this note and open it with Quick Look.
4. Check it shows the graph's name, a legend, and a line starting "From" with this note's name, then "exported" and the day.
5. Export again with Dark and check the same content in dark colours.
6. Delete the exported files when done; the vault reset also removes them.

**Checklist line:**

> **X-01** Mac: Export on a card, The whole diagram, SVG, Light, Export it: a file `\<note>-\<graph>-\<day>.svg` appears next to the note; opened outside Obsidian (Finder's Quick Look) it reads the same, with the graph's name, its legend, and "From \<note>, exported \<day>" (slice 2, export_two_scopes, export_formats, export_self_explaining, export_fixed_theme). Dark: the same in dark colours.

**Back to the checklist:** [X-01 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for X-01 in its list.
