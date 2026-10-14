# Q-03 Graph from a gql file

**You should see:** once the file is made, the graph written in `Graph files/trip.gql` drawn here, read-only, under a line saying "Drawn from the file Graph files/trip.gql", with no Edit here on its bar. Nothing of the file is copied into this note. When the file is changed and saved in another editor, the card draws the change; a line of the file that cannot be read is left out and listed behind the badge, and the rest is still drawn.

**Test diagram:**

```gql
// graph: trip · FROM Graph files/trip.gql
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview, with the cursor outside the block. Before the file is made, the card says the file is not in the vault.
1. On the Mac, in Finder, make a folder `Graph files` at the root of the test vault, and in it a plain text file `trip.gql` holding these four lines:
   `// graph: trip`
   `(home:Place {name: 'Home'}),`
   `(park:Place {name: 'The park'}),`
   `(home)-[:NEAR]->(park)`
2. Come back to this note. Check the card draws Home and The park under a line naming the file, and offers no Edit here.
3. In TextEdit, add a line `, (lake:Place {name: 'The lake'})` at the end of the file and save it. Check the card draws The lake too.
4. Add another line, `, (cafe:Place {name: 'Cafe' oops})`, and save. Check the rest is still drawn and the badge lists the problem at its line in the file.
5. Keep the file for Q-04, then delete the `Graph files` folder when Q-04 is done.

**Checklist line:**

> **Q-03** Mac: put a plain text file `trip.gql` in a folder `Graph files` at the root of the vault, holding a graph that starts `// graph: trip`. A block `// graph: trip · FROM Graph files/trip.gql` draws it, under a line naming the file, with no Edit here. Change the file in another editor and save it: the card draws the change. Add a line that cannot be read: the rest is still drawn, and the problem is listed.

**Back to the checklist:** [Q-03 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for Q-03 in its list.
