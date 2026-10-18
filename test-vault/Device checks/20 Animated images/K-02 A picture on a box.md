# K-02 A picture on a box

**You should see:** each cat's box carries its picture at the top, above the word CAT and its name, and the picture moves. A small square button sits in the picture's lower right corner, showing two bars for pause. Rex is a dog, and no Picture asks for one, so his box has no picture and keeps its usual size. Switch Obsidian between its light and dark themes: the pictures, the buttons and the boxes read clearly in both.

**Test diagram:**

Before you start, make the files: run `node scripts/reset-test-vault.mjs` in the repository (or `node scripts/make-test-files.mjs`, which makes only the test files). It writes three animated GIFs into this note's folder, `Device checks/20 Animated images`, named `tom.gif`, `kit.gif` and `rex.gif`. Nothing is put in by hand.

```gql
// graph: cats · SOURCE
(tom:Cat {name: 'Tom', photo: '[[tom.gif]]'}),
(kit:Cat {name: 'Kit', photo: '[[kit.gif]]'}),
(rex:Dog {name: 'Rex', photo: '[[rex.gif]]'}),
(tom)-[:CHASES]->(rex),
(kit)-[:CHASES]->(rex)
```

The style block: a picture on every cat's box, from its photo.

```gql
// graph: cats_style · STYLE cats
(p1:Picture {property: 'photo', kind: 'Cat'})
```

<!-- expect: clean -->

**Do this:**

1. Make the three GIFs, as above, and open this note.
2. Look at Tom's and Kit's boxes: each picture moves at the top of its box, with the pause button in its corner.
3. Look at Rex's box: no picture.
4. Switch Obsidian to the other theme, in Settings › Appearance, and look again; then switch it back.

**Checklist line:**

> **K-02** A graph whose style block holds a Picture for the kind Cat: each cat's box shows its image moving. The image is at the top of the box above its kind, with a small pause button in the picture's corner. The dog's box has no picture. Light and dark themes both.

**Back to the checklist:** [K-02 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for K-02 in its list.
