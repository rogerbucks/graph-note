# M-05 Over the size limit

**You should see:** the drawing comes at once, and Big's picture fills in a moment later, still on its first frame. In Big's details the image is still too, and says it is shown as its first frame because it is over the 5 MB an animated image may be, followed by the limits in one sentence: at most 5 MB, at most 2,000,000 pixels a frame, at most 500 frames, and at most 6 moving at once in one drawing. Its button says Play but is marked as not available; pressing it leaves the image still and says why again. Small, the small GIF, moves as usual.

**Test diagram:**

Before you start, put two animated GIFs in this note's folder, `Device checks/19 Animated images`, on the Mac, outside Obsidian: one larger than 5 MB named `big.gif` (a long screen recording saved as a GIF will do), and a small one named `small.gif`. Take them out again afterwards.

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

1. Put the two GIFs in this note's folder and open this note: the drawing comes at once.
2. Look at Big's picture: still. Small's moves.
3. Open Big's details: the image is still, and says why, with the limits.
4. Press Play on Big's image, in the details and on the box: it stays still, and says why again.

**Checklist line:**

> **M-05** A thing whose image is the GIF of more than 5 MB: its picture and its image in the details are still, its
> first frame, saying it is over the 5 MB an animated image may be, and the limits in a sentence; pressing Play
> leaves it still and says why again. The drawing is drawn at once, without waiting for it.

**Back to the checklist:** [M-05 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for M-05 in its list.
