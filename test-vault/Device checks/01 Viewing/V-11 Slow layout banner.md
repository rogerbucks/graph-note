# V-11 Slow layout banner

**You should see:** for a graph whose layout runs past five seconds, its text shown with the "took too long" banner and a clock icon, and the next graph below still drawn. The console says nothing about the main thread, because the layout ran in a worker. The text has no Export button either. No small graph takes five seconds, so the generator below makes a dense one that stays under the size limits (2,000 things and 5,000 links), and so reaches the layout instead of being refused for size. How long it takes depends on the device: on a slow one it is the time-out banner; if it lays out in under five seconds on yours, raise the numbers in the script a little, keeping things under 2,000 and links under 5,000.

**Test diagram:**

```gql
// graph: tangle · SOURCE
(n1:Thing {name: 'N1'}),
(n2:Thing {name: 'N2'}),
(n3:Thing {name: 'N3'}),
(n1)-[:LINKS]->(n2),
(n2)-[:LINKS]->(n3),
(n1)-[:LINKS]->(n3)
```

The graph that must still draw after it.

```gql
// graph: after · SOURCE
(a:Thing {name: 'After A'}),
(b:Thing {name: 'After B'}),
(a)-[:LINKS]->(b)
```

<!-- expect: clean -->

**Do this:**

1. Save this script as `make-dense.mjs`, in any folder outside the vault. It needs Node (version 18 or newer); in a terminal in that folder, run `node make-dense.mjs | pbcopy` on a Mac (on Linux, `node make-dense.mjs | xclip -selection clipboard`; on Windows, `node make-dense.mjs | clip`). It prints 1,600 things and 4,800 links, one to a line, each linking a thing to three others spread round a ring, so the layout is hard but the graph is under both limits:

   ```js
   const n = 1600;
   const out = [];
   for (let i = 0; i < n; i++) out.push(`(t${i}:Thing {name: 'Thing ${i}'}),`);
   for (let i = 0; i < n; i++)
     for (const hop of [1, 7, 31]) out.push(`(t${i})-[:LINKS]->(t${(i + hop) % n}),`);
   console.log(out.join('\n').replace(/,$/, ''));
   ```

2. Open this note in edit (source) mode, select everything between the first block's graph line and its closing fence, and paste the output in its place. This is your copy in the vault; undo, or reset the vault, when done.
3. Wait for the layout. Read the banner: "took too long" and a clock icon.
4. Check the second graph below still draws.
5. Open the developer console and check it says nothing about the main thread. Check the text has no Export button.

**Checklist line:**

> **V-11** A graph whose layout runs past five seconds shows its text with the "took too long" banner and a clock icon. The next graph still draws. The console says nothing about the main thread: the layout ran in a worker (§9). The text has no Export button either.

**Back to the checklist:** [V-11 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for V-11 in its list.
