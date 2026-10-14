# K-06 Six moving at once

**You should see:** of the seven cats, the first six pictures move and the seventh, Gus, stands still on its first frame. Hovering Gus's control on the Mac says six animated images are already moving here, and to pause one of them to play this one; pressing Play on Gus leaves it still and says so again. Pause Ada's picture, then press Play on Gus: Gus moves.

**Test diagram:**

Before you start, put seven animated GIFs in this note's folder, `Device checks/20 Animated images`, on the Mac, outside Obsidian, named `c1.gif` to `c7.gif`; the same GIF copied seven times will do. Take them out again afterwards.

```gql
// graph: seven · SOURCE
(ada:Cat {name: 'Ada', photo: '[[c1.gif]]'}),
(bea:Cat {name: 'Bea', photo: '[[c2.gif]]'}),
(cal:Cat {name: 'Cal', photo: '[[c3.gif]]'}),
(dot:Cat {name: 'Dot', photo: '[[c4.gif]]'}),
(eve:Cat {name: 'Eve', photo: '[[c5.gif]]'}),
(fay:Cat {name: 'Fay', photo: '[[c6.gif]]'}),
(gus:Cat {name: 'Gus', photo: '[[c7.gif]]'})
```

The style block: a picture on every cat's box.

```gql
// graph: seven_style · STYLE seven
(p1:Picture {property: 'photo', kind: 'Cat'})
```

<!-- expect: clean -->

**Do this:**

1. Put the seven GIFs in this note's folder and open this note.
2. Count the moving pictures: six move, and Gus's is still.
3. Press Play on Gus's picture: it stays still, and says six are already moving.
4. Press Pause on Ada's picture, then Play on Gus's: Gus moves.

**Checklist line:**

> **K-06** Seven cats, each with an animated GIF and a Picture: six pictures move and the seventh is still, saying six
> are already moving here; pressing its Play says so again. Pause one of the six, then press Play on the seventh:
> it moves.

**Back to the checklist:** [K-06 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for K-06 in its list.
