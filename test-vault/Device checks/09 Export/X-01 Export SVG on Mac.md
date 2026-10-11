# X-01 Export SVG on Mac

**You should see:** a file named `X-01-Export-SVG-on-Mac-trip-<YYYY-MM-DD>.svg` (the note's name with its spaces as hyphens, the graph's name, and today's day) appearing in this note's folder, `Device checks/09 Export`. Opened outside Obsidian (Finder's Quick Look) it reads the same as the card, with the graph's name, `trip`, at the top, a legend, and at the foot `From Device checks/09 Export/X-01 Export SVG on Mac.md, exported <D Mon YYYY>`, with the day's own date, such as 11 Oct 2026. Exported in dark, it has the same content in dark colours.

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
<!-- expect: footer "From Device checks/09 Export/X-01 Export SVG on Mac.md, exported <D Mon YYYY>" -->
<!-- expect: export-file "X-01-Export-SVG-on-Mac-trip-<YYYY-MM-DD>.svg" -->

**Do this:**

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. On the Mac, press Export on the card.
2. Choose The whole diagram, SVG, Light, and press Export it.
3. Find the new `.svg` in `Device checks/09 Export` and open it with Quick Look (select it in Finder and press Space).
4. Check it shows the graph's name, a legend, and the foot line above.
5. Export again with Dark and check the same content in dark colours.
6. Delete the exported files when done; the vault reset also removes them.

**Checklist line:**

> **X-01** Mac: Export on a card, The whole diagram, SVG, Light, Export it: a file `\<note>-\<graph>-\<day>.svg` appears next to the note; opened outside Obsidian (Finder's Quick Look) it reads the same, with the graph's name, its legend, and "From \<note>, exported \<day>". Dark: the same in dark colours.

**Back to the checklist:** [X-01 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for X-01 in its list.
