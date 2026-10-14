# M-04 Still under reduced motion

**You should see:** with the system's reduce-motion setting on, every picture on a box and every image in the details stands still on its first frame. Each control shows Play, and each image in the details says it is still, as the system asks for reduced motion, and that Play moves it; hovering a picture's control on the Mac shows the same words. Pressing Play on one picture moves that one only: the others stay still.

**Test diagram:**

Before you start, put animated GIFs named `tom.gif` and `kit.gif` in this note's folder, `Device checks/19 Animated images`, on the Mac, outside Obsidian. Take them out again afterwards.

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
2. Put the two GIFs in this note's folder, and close and open this note again, so it is drawn afresh: both pictures are still, and each control shows Play.
3. Open Tom's details: his image is still, and says why.
4. Press Play on Kit's picture: Kit's picture moves, and Tom's stays still.
5. Turn the setting off again.

**Checklist line:**

> **M-04** Turn the system's reduce-motion setting on and redraw the note of M-02: every picture and every image in
> the details is still, its first frame, each saying it is still as the system asks; press Play on one: only that
> one moves. Turn the setting off again afterwards.

**Back to the checklist:** [M-04 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for M-04 in its list.
