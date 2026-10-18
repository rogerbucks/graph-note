# L-02 A dot on every link

**You should see:** a dot travelling along every link of the graph, in the direction each link reads, the arrowhead's way. The Guide and Green each only receive a link, so Graphviz draws one of those two links from its far end, its line laid out on the far side: its dot still runs the way the link reads, towards its arrowhead. Each label opens with •, and the legend under the bar says "• a moving dot: visits go this way". With VoiceOver, a link is read as, for example, "Link: Home near The park, a moving dot: visits go this way". The view quiet, below, draws the same links still, as its Flow says.

**Test diagram:**

```gql
// graph: trip · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Cafe {name: 'Cafe'}),
(guide:Source {name: 'The guide'}),
(green:Tag {name: 'Green'}),
(home)-[:NEAR]->(park),
(cafe)-[:SERVES]->(park),
(home)-[:CITES]->(guide),
(park)-[:TAGGED]->(green)
```

The style block: a dot on every link, and still in the view quiet.

```gql
// graph: trip_style · STYLE trip
(f1:Flow {motion: 'dot', means: 'visits go this way'}),
(f2:Flow {motion: 'still', view: 'quiet'})
```

The view quiet: the park and the things linked to it.

```gql
// graph: trip · QUERY view quiet
MATCH (n {id: 'park'})-[]-{1,1}(m) RETURN n, m
```

<!-- expect: clean -->

**Do this:**

1. Watch each link of the first drawing: a dot travels along it, from the thing it starts at to the thing it points to.
2. Watch the CITES and TAGGED links: each dot runs towards its arrowhead, the one Graphviz drew from its far end too.
3. Read each label: it opens with •. Read the legend under the bar.
4. With VoiceOver on, move to a link and listen for "a moving dot: visits go this way".
5. Look at the view quiet: its links are still, with no dot.
6. Repeat on the phone.

**Checklist line:**

> **L-02** A Flow with a dot for every link: a dot travels along each link, the link drawn from its far end too, in the direction it reads, and each label opens with •. With VoiceOver, a link is read with "a moving dot:" and what it means. A view whose Flow is still draws its links still.

**Back to the checklist:** [L-02 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for L-02 in its list.
