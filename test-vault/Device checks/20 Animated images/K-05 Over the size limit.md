# K-05 Over the size limit

**You should see:** the drawing comes at once. Big's image is over the size limit, so it is never read: the top of Big's box is empty but for its Play control in the corner, and hovering the control on the Mac says it is not shown because it is over the 5 MB an animated image may be. In Big's details the image shows nothing, and says the same, followed by the limits in one sentence: at most 5 MB, at most 2,000,000 pixels a frame, at most 500 frames, and at most 6 moving at once in one drawing. Its button says Play but is marked as not available; pressing it changes nothing and says why again. Small, the small GIF, moves as usual.

**Test diagram:**

Before you start, make the files: run `node scripts/reset-test-vault.mjs` in the repository (or `node scripts/make-test-files.mjs`, which makes only the test files). It writes two animated GIFs into this note's folder, `Device checks/20 Animated images`: one larger than 5 MB named `big.gif`, which git does not keep and the script makes each time, and a small one named `small.gif`. Nothing is put in by hand.

```gql
// graph: sizes · SOURCE
(big:Clip {name: 'Big', photo: '[[big.gif]]'}),
(small:Clip {name: 'Small', photo: '[[small.gif]]'}),
(big)-[:BEFORE]->(small)
```

The style block: a picture on every clip's box.

```gql
// graph: sizes_style · STYLE sizes
(p1:Picture {property: 'photo', kind: 'Clip'})
```

<!-- expect: clean -->

**Do this:**

1. Make the two GIFs, as above, and open this note: the drawing comes at once.
2. Look at Big's box: no picture, only the Play control where it would be. Small's picture moves.
3. Open Big's details: no image, and the words say why, with the limits.
4. Press Play on Big's image in the details: nothing moves, and it says why again.

**Checklist line:**

> **K-05** A thing whose image is the GIF of more than 5 MB: it is never read, so its box shows only its Play control
> where the picture would be, and its image in the details shows nothing, each saying it is over the 5 MB an animated image may be, and the limits
> in a sentence; pressing Play leaves it so and says why again. The drawing is drawn at once, without waiting for it.

**Back to the checklist:** [K-05 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for K-05 in its list.
