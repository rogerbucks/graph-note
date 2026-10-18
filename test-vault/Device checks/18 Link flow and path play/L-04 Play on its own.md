# L-04 Play on its own

**You should see:** pressing Play Sunday walk starts at Home and steps on by itself, two seconds a step, through The park and The lake to Cafe, where it stops. The step now on is outlined heavier and pulses gently, and when a link joins it to the step before, a dot runs along that link towards it. The strip says "Step 2 of 4: The park" and so on as it goes. Half a second a step, chosen under Pace, speeds it up at once; Pause holds it, Play on carries on, Next pauses it, and Stop playing clears everything.

**Test diagram:**

```gql
// graph: trip · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(lake:Place {name: 'The lake'}),
(cafe:Cafe {name: 'Cafe'}),
(home)-[:NEAR]->(park),
(park)-[:NEAR]->(lake),
(cafe)-[:SERVES]->(park),
(tour:Path {title: 'Sunday walk'}),
(tour)-[:STEP {seq: 1}]->(home),
(tour)-[:STEP {seq: 2}]->(park),
(tour)-[:STEP {seq: 3}]->(lake),
(tour)-[:STEP {seq: 4}]->(cafe)
```

<!-- expect: clean -->

**Do this:**

1. Press Play Sunday walk, and do nothing else: it steps from Home to Cafe, two seconds a step, and stops at Cafe.
2. Watch the step now on pulse, and a dot run from Home to The park, then from The park to The lake; none from The lake to Cafe, which no link joins.
3. Press Play on to play it again, choose Half a second a step under Pace, and see it go faster at once.
4. Press Pause on The park: it stays there. Press Play on: it carries on from The park.
5. Press Next step: it moves one step and pauses. Press Stop playing: the outline and the words clear.
6. Repeat on the phone.

**Checklist line:**

> **L-04** Press Play \<title>: the path steps on its own, two seconds a step, the step now on outlined and pulsing, and a dot running the link from the step before when a link joins them; "Step 2 of 4: …" is said each step. Choose Half a second a step under Pace: it goes faster at once. Pause holds it on its step and Play on carries on from there; Next pauses it; at the last step it stops; Stop playing clears it. Desktop and phone.

**Back to the checklist:** [L-04 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for L-04 in its list.
