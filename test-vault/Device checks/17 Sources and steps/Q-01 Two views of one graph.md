# Q-01 Two views of one graph

**You should see:** two view cards under the graph block, each drawing only its own view of the one trip graph: the first everything within one step of The park, the second Home and The lake picked by hand. In each, the things outside the view are faded. Both are drawn from the graph block above them, and neither view block holds any of the graph. When you change a name in the graph block, both views draw the new name.

**Test diagram:**

```gql
// graph: trip
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Place {name: 'Cafe'}),
(lake:Place {name: 'The lake'}),
(home)-[:NEAR]->(park), (park)-[:NEAR]->(cafe), (cafe)-[:NEAR]->(lake)
```

The first view: everything within one step of The park.

```gql
// graph: trip · QUERY view round_park
MATCH (n {id: 'park'})-[]-{1,1}(m) RETURN n, m
```

The second view: Home and The lake, picked by hand.

```gql
// graph: trip · QUERY view ends
MATCH (n) WHERE n.id IN ['home', 'lake'] RETURN n
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview, with the cursor outside the blocks.
1. Look at the two view cards. Check the first reads "everything within 1 step of The park", with Home, The park and Cafe at full strength and The lake faded.
2. Check the second shows Home and The lake at full strength, and The park and Cafe faded.
3. In the graph block, change `'The park'` to `'The big park'`. Check both view cards now say The big park.
4. Check the two view blocks still hold only their queries: nothing of the graph has been copied into them.
5. Change the name back.

**Checklist line:**

> **Q-01** Two views of one graph in one note, the graph block above them: each card draws only its view, from the one graph block, and the things outside it are faded. Change a name in the graph block: both views draw the new name. Nothing of the graph is copied into the views' blocks.

**Back to the checklist:** [Q-01 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for Q-01 in its list.
