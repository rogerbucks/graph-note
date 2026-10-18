# V-13 Schema drawn as a picture

**You should see:** the trip graph drawn as usual, then its schema below it drawn as a picture of its own: a box for each kind of thing (Place, Person), an arrow "is near" from Place back to Place, an arrow "lives at" from Person to Place, and a box "visits (not used yet)". The schema's card offers Source, and no Edit here.

**Test diagram:**

```gql
// graph: trip · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(ann:Person {name: 'Ann'}),
(home)-[:NEAR]->(park),
(ann)-[:LIVES_AT]->(home)
```

Its schema, written after the data.

```gql
// graph: trip · SOURCE
(trip_schema:GraphMeta {graph: 'trip', schema: 'trip@1'}),
(kind_place:Meta:ElementType {name: 'Place', kind: 'node', origin: 'source'}),
(kind_person:Meta:ElementType {name: 'Person', kind: 'node', origin: 'source'}),
(link_near:Meta:ElementType {name: 'NEAR', kind: 'edge', origin: 'source', reading: 'is near', reverse_name: 'is near'}),
(link_lives:Meta:ElementType {name: 'LIVES_AT', kind: 'edge', origin: 'source', reading: 'lives at', reverse_name: 'is home to'}),
(link_visits:Meta:ElementType {name: 'VISITS', kind: 'edge', origin: 'source', reading: 'visits', reverse_name: 'is visited by'}),
(trip_schema)-[:DECLARES]->(kind_place),
(trip_schema)-[:DECLARES]->(kind_person),
(trip_schema)-[:DECLARES]->(link_near),
(trip_schema)-[:DECLARES]->(link_lives),
(trip_schema)-[:DECLARES]->(link_visits)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): there the schema's card must still offer no Edit here.
1. Look at the second drawing: check the boxes and arrows above.
2. Tap a box: its details name the kind.
3. Press Source: the schema's text is shown; press it again for the picture.

**Checklist line:**

> **V-13** A block that holds only a graph's schema is drawn as the schema: each kind a box, each relationship type an arrow between the kinds it joins, read by its reading, and a type not used yet a box saying so. Source shows its text, and the card offers no Edit here (§3, schema_drawn).

**Back to the checklist:** [V-13 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for V-13 in its list.
