# K-03 Pause and play

**You should see:** on the Mac, Tab reaches Tom's box and then the control on his picture, which shows a focus ring. Enter stops the picture on its first frame and the control turns to a triangle for Play; Space sets it moving again. Neither key opens Tom's details. In the details the image has a Pause button, which Enter presses, and then a Play button. On the phone a tap on the control in the picture's corner pauses it and a second tap plays it, and the tap never selects the box; the button in the details works the same by tap.

**Test diagram:**

Before you start, make the file: run `node scripts/reset-test-vault.mjs` in the repository (or `node scripts/make-test-files.mjs`, which makes only the test files). It writes an animated GIF named `tom.gif` into this note's folder, `Device checks/20 Animated images`. Nothing is put in by hand.

```gql
// graph: tom · SOURCE
(tom:Cat {name: 'Tom', photo: '[[tom.gif]]'}),
(jerry:Mouse {name: 'Jerry'}),
(tom)-[:CHASES]->(jerry)
```

The style block: Tom's picture on his box.

```gql
// graph: tom_style · STYLE tom
(p1:Picture {property: 'photo', thing: 'tom'})
```

<!-- expect: clean -->

**Do this:**

1. Make tom.gif, as above, and open this note.
2. Mac: click in the note above the drawing, then press Tab until Tom's box is outlined, and Tab once more: the picture's control is outlined.
3. Press Enter: the picture stops and the control shows Play. Press Space: it moves again. The details stay closed.
4. Press Enter on Tom's box itself to open his details, Tab to Pause and press Enter, then press Enter on Play.
5. Phone: tap the control in the corner of Tom's picture, then tap it again; open his details and tap Pause, then Play.

**Checklist line:**

> **K-03** Desktop: Tab to the picture's control on a box and press Enter: the picture stops on its first frame and the
> control shows Play; press Space: it moves again. The details do not open. In the details, Tab to Pause and press
> Enter, then Play. Phone: tap the control on a box, then the button in the details: each pauses and plays, and the
> tap never selects the box.

**Back to the checklist:** [K-03 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for K-03 in its list.
