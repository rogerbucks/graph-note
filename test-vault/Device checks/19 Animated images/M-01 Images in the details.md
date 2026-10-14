# M-01 Images in the details

**You should see:** opening Ann's details shows a part headed Images. In it cat.gif, spin.png, dance.webp and loop.svg are each moving, each with its property and file name under it and a Pause button beside it. The site property names an image on the web: it says the address is outside the vault and is not loaded, and no image is shown for it, so nothing is fetched from the web. Kit's details show kit.png, a still image, with no button.

**Test diagram:**

Before you start, put four animated images and one still one in this note's folder, `Device checks/19 Animated images`, on the Mac, outside Obsidian: an animated GIF named `cat.gif`, an animated PNG (APNG) named `spin.png`, an animated WebP named `dance.webp`, an SVG that animates (with an `<animate>` element) named `loop.svg`, and any still PNG named `kit.png`. Take them out again afterwards.

```gql
// graph: pets · SOURCE
(ann:Pet {name: 'Ann', photo: '[[cat.gif]]', spin: '[[spin.png]]', badge: '[[dance.webp]]', icon: '[[loop.svg]]', site: 'https://example.com/cat.gif'}),
(kit:Pet {name: 'Kit', photo: '[[kit.png]]'}),
(ann)-[:KNOWS]->(kit)
```

<!-- expect: clean -->

**Do this:**

1. Put the five images in this note's folder, as above, and open this note.
2. Tap Ann, or Tab to Ann and press Enter: the details open. Under Images, cat.gif, spin.png, dance.webp and loop.svg each move, each with a Pause button.
3. Read the site entry: it says the address is outside the vault and is not loaded, and shows no image.
4. Open Kit's details: kit.png is shown still, with no button.

**Checklist line:**

> **M-01** Open the details of Ann: under Images, cat.gif, spin.png, dance.webp and loop.svg each move, each with its
> name and a Pause button; a property naming an image outside the vault says it is not loaded, and shows nothing.

**Back to the checklist:** [M-01 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for M-01 in its list.
