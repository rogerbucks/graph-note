# V-12 Light and dark themes

**You should see:** three drawings that read well in the light theme and again in the dark theme: text readable, links and boxes distinct from the background, and each card standing out from the page around it.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(small:Option {name: 'Small reader'}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question)
```

A second drawing, of other kinds.

```gql
// graph: trip · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Cafe {name: 'Cafe'}),
(home)-[:NEAR]->(park),
(park)-[:NEAR]->(cafe)
```

A third, with a misspelt link, so a dashed estimate is checked in both themes.

```gql
// graph: team · SOURCE
(alice:Person {name: 'Alice'}),
(bob:Person {name: 'Bob'}),
(core:Team {name: 'Core'}),
(alice)-[:MEMBER_OF]->(core),
(bob)-[:MEMBER_OF]->(cor)
```

<!-- expect: problem "cor is not in graph team" -->

**Do this:**

1. In Settings, Appearance, choose the dark theme and look at all three drawings.
2. Choose the light theme and look again.
3. Repeat on the phone.

**Checklist line:**

> **V-12** The drawing reads well in the light theme and in the dark theme. Dark, several drawings in a note, each card standing out:

**Back to the checklist:** [V-12 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for V-12 in its list.
