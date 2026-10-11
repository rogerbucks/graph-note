# T-02 Play a path

**You should see:** Play Sunday walk showing "Step 1 of 3: …", read out by VoiceOver, with the box outlined heavier. Next and Previous move one step and stop at the ends. Stop playing clears the marking. The same on desktop and phone, light and dark.

**Test diagram:**

```gql
// graph: trip · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(lake:Place {name: 'The lake'}),
(home)-[:NEAR]->(park),
(park)-[:NEAR]->(lake),
(tour:Path {title: 'Sunday walk'}),
(tour)-[:STEP {seq: 1}]->(home),
(tour)-[:STEP {seq: 2}]->(park),
(tour)-[:STEP {seq: 3}]->(lake)
```

<!-- expect: clean -->

**Do this:**

1. Press Play Sunday walk. Read the line "Step 1 of 3: …" and check Home is outlined heavier.
2. With VoiceOver on, listen for the same sentence.
3. Press Next twice and check you reach step 3; press Next once more and check it stops.
4. Press Previous back to step 1 and check it stops there.
5. Press Stop playing and check the outline and the sentence clear.
6. Repeat on the phone and in the other theme.

**Checklist line:**

> **T-02** Press Play \<title>: "Step 1 of 3: …" is shown and read by VoiceOver, the box outlined heavier; Next and Previous move one step, and stop at the ends; Stop playing clears it. Desktop and phone, light and dark.

**Back to the checklist:** [T-02 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for T-02 in its list.
