# A long note with graphs

## Part 1

This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll.

## Part 2

This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll.

## Part 3

This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll.

```gql
// graph: trip
(home:Place {name: 'Home'}),
(walk:Leg {name: 'Walk'}),
(walk)-[:STARTS_AT]->(home)
```

## Part 4

This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll.

## Part 5

This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll.

## Part 6

This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll.

```gql
// graph: trip
(bus:Leg {name: 'Bus'}),
(train:Leg {name: 'Train'}),
(bus)-[:FOLLOWS]->(walk),
(train)-[:FOLLOWS]->(bus)
```

## Part 7

This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll.

## Part 8

This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll. This paragraph is filler, so the note is long enough to scroll.
