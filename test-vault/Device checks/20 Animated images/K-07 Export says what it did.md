# K-07 Export says what it did

**You should see:** exporting the drawing as SVG ends with a notice that names the exported file and then says, for each cat, that its GIF was kept moving, and still under reduced motion. Opened in a browser, the SVG shows each cat's picture moving in its box; with the reduce-motion setting on, the same file shows each picture still. The file is self-contained: it opens with the Wi-Fi off and asks for nothing from the web. Exporting as PNG ends with a notice that says each cat's GIF was reduced to its first frame, as a PNG cannot move, and the PNG shows each picture still.

**Test diagram:**

Before you start, put animated GIFs named `tom.gif` and `kit.gif` in this note's folder, `Device checks/20 Animated images`, on the Mac, outside Obsidian. Take them out again afterwards, with the exported files.

```gql
// graph: export · SOURCE
(tom:Cat {name: 'Tom', photo: '[[tom.gif]]'}),
(kit:Cat {name: 'Kit', photo: '[[kit.gif]]'}),
(tom)-[:CHASES]->(kit)
```

The style block: a picture on every cat's box.

```gql
// graph: export_style · STYLE export
(p1:Picture {property: 'photo', kind: 'Cat'})
```

<!-- expect: clean -->

**Do this:**

1. Put the two GIFs in this note's folder and open this note.
2. Press Export, choose SVG, and press Export it: read the notice.
3. Open the SVG file in a browser: the pictures move. Turn the reduce-motion setting on and reload it: they are still. Turn the setting off again.
4. Press Export, choose PNG, and press Export it: read the notice, and open the PNG.

**Checklist line:**

> **K-07** Export the note of K-02 as SVG: the notice says each cat's image was kept moving, and still under reduced
> motion; opened in a browser the file shows them moving, and still with reduce motion on, and loads nothing from
> elsewhere. Export it as PNG: the notice says each was reduced to its first frame, as a PNG cannot move.

**Back to the checklist:** [K-07 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for K-07 in its list.
