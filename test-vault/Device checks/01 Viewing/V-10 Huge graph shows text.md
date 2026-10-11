# V-10 Huge graph shows text

**You should see:** once the graph has more than 2,000 things, its text shown in place of a drawing, under a banner with an icon that says the limit and the numbers in words. Obsidian stays responsive while it is checked: the note scrolls and the other block below it draws. The seed below is small and draws normally; it only becomes the huge case after step 2.

**Test diagram:**

```gql
// graph: huge · SOURCE
(seed_1:Thing {name: 'Seed 1'}),
(seed_2:Thing {name: 'Seed 2'}),
(seed_1)-[:NEXT]->(seed_2)
```

The block that must still draw while the huge one is checked.

```gql
// graph: small · SOURCE
(a:Thing {name: 'A'}),
(b:Thing {name: 'B'}),
(a)-[:NEXT]->(b)
```

<!-- expect: clean -->

**Do this:**

1. Run this in a terminal to print 2,100 extra things:

   ```js
   for (let i = 1; i <= 2100; i++) console.log(`(t${i}:Thing {name: 'Thing ${i}'}),`);
   ```

2. Paste the printed lines into the first block, after `(seed_1:Thing {name: 'Seed 1'}),`. This note is a copy in the vault; undo it, or reset the vault, when done.
3. Look for the banner over the text, and read the limit and the numbers in it.
4. While it is up, scroll the note and watch the second block draw.
5. Repeat on the phone.

**Checklist line:**

> **V-10** A huge graph (over 2,000 things, made by a script) shows its text with a banner — an icon, and the limit and the numbers in words — and Obsidian stays responsive: the note scrolls and other blocks draw while it is checked. On the desktop and on the phone (§9, layout_contained; the tests run the worker in a Node thread, not a web view).

**Back to the checklist:** [V-10 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for V-10 in its list.
