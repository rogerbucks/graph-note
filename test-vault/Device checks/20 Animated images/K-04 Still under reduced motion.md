# K-04 Still under reduced motion

**You should see:** with the system's reduce-motion setting on, every picture on a box and every image in the details stands still on its first frame. Each control shows Play, and each image in the details says it is still, as the system asks for reduced motion, and that Play moves it; hovering a picture's control on the Mac shows the same words. Pressing Play on one picture moves that one only: the others stay still.

**Test diagram:**

Before you start, make the files: run `node scripts/reset-test-vault.mjs` in the repository (or `node scripts/make-test-files.mjs`, which makes only the test files). It writes animated GIFs named `tom.gif` and `kit.gif` into this note's folder, `Device checks/20 Animated images`. Nothing is put in by hand.

```gql
// graph: still · SOURCE
(tom:Cat {name: 'Tom', photo: '[[tom.gif]]'}),
(kit:Cat {name: 'Kit', photo: '[[kit.gif]]'}),
(tom)-[:CHASES]->(kit)
```

The style block: a picture on every cat's box.

```gql
// graph: still_style · STYLE still
(p1:Picture {property: 'photo', kind: 'Cat'})
```

<!-- expect: clean -->

**Do this:**

1. Turn the reduce-motion setting on: on the Mac, System Settings › Accessibility › Display › Reduce motion; on the iPhone, Settings › Accessibility › Motion › Reduce Motion.
2. Make the two GIFs, as above, and close and open this note again, so it is drawn afresh: both pictures are still, and each control shows Play.
3. Open Tom's details: his image is still, and says why.
4. Press Play on Kit's picture: Kit's picture moves, and Tom's stays still.
5. Turn the setting off again.

**Checklist line:**

> **K-04** Turn the system's reduce-motion setting on and redraw the note of K-02: every picture and every image in
> the details is still, its first frame, each saying it is still as the system asks; press Play on one: only that
> one moves. Turn the setting off again afterwards.

**Back to the checklist:** [K-04 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for K-04 in its list.
