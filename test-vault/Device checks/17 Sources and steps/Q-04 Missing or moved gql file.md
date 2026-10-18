# Q-04 Missing or moved gql file

**You should see:** a card that says, in a sentence, "The file Graph files/nowhere.gql is not in the vault, so graph trip cannot be drawn from it", with what to do and the block's text below it; never a blank card. When the file of Q-03 is moved into another folder, Q-03's card says at once that it is not there any more and names where a file of that name now is; moved back, it is drawn again.

**Test diagram:**

```gql
// graph: trip · FROM Graph files/nowhere.gql
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview, with the cursor outside the block.
1. Check the card says the file Graph files/nowhere.gql is not in the vault, says what to do, and shows the block as text, with no blank drawing.
2. Open Q-03, with its file made by the generator, as Q-03 says. In Obsidian's file list, drag `trip.gql` from `Graph files` into another folder.
3. Check Q-03's card says at once that the file is not there any more, and that a file of that name is in the folder you moved it to.
4. Drag it back. Check Q-03's card draws the graph again.
5. Nothing to clean up: running the reset puts the file back.

**Checklist line:**

> **Q-04** A block drawn from a file that is not there says which file and why, never a blank card: `Graph files/nowhere.gql` is "not in the vault". Move `trip.gql` of Q-03 into another folder: Q-03's card says at once that it is not there any more and where a file of that name now is, and moving it back draws it again.

**Back to the checklist:** [Q-04 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for Q-04 in its list.
