# Diagram types (spec §15), views (spec §2, §7), graph sources and steps (spec §20)

Purpose: which diagram type fits a drawing, named query views of a note, and graphs drawn from another file or worked out by a step. Part of the [core guide](../GUIDE.md).

## Diagram types (spec §15)

A graph is drawn as a network unless its style graph chooses a type: `(d1:Diagram {type: 'tree', relationship:
'MANAGES'})`, for the whole graph or, with `view`, for one view (type_remembered). Style-graph.ts holds the seven
`DIAGRAM_TYPES`; style-checks.ts and style-conflicts.ts check a Diagram's words and allow one type for each place.

- `types-shape.ts` — the shape a type is judged on (`shapeOf`: the things, their kinds and first dates, the links, and
  the groups the nudges draw), with its first loop and its centre.
- `types.ts` — which types fit a drawing's shape, and why each that does not (`typeFits`): a network always; a tree
  along one relationship with at most one parent each (a parent linked twice is one) and no loop (none chosen: the
  relationship with the most links that makes one, of two with as many the first by name); a flow, links with no loop;
  a radial drawing, three things or more joined to the centre, the thing with the most links, and no group written; lanes,
  every thing of one kind and every group of one kind, two kinds or more, each group drawn inside its lane and never by
  the nudges again; a timeline, every thing carrying a date, a rank for each day; a table, any things. `suggestType` gives the best fit and why, never
  drawn unless chosen; `diagramFor` the type drawn: the chosen one while it fits, else a network, with why and
  `nearestType` (type_stops_fitting), and the plan Graphviz lays it out by; `diagramOffer` all three at once, for a
  host's card, a tree judged along the relationship chosen for it. `styledDrawing` puts that plan on the
  drawing; render.ts writes it in first (graph-layout.js `typedSource`) and lays a tree out down and the other types
  across, unless a direction is set. The Python library judges and lays out alike (`graphspec/style/diagram_types.py`),
  held byte for byte on `python/graph_spec/tests/type_cases.json` by `test/layout-parity.test.js`.
- `types-table.ts` — the table, which the host draws as a plain table (`tableOf`: Thing, Kind and each property, and
  each link); the way in to a graph of more than `LARGE_GRAPH` things (`wayIn`, large_way_in); and which types scroll
  one way only on a phone (`scrollsOneWay`).

## Views (spec §2, §7)

A view is a named query block in the note: `// graph: <graph> · QUERY view <name>`, then the query. The reader already
reads `· QUERY` as a query, and the core draws no query as data, so a view is never drawn as a graph of its own.

- `views.ts` — `viewsOf` finds the views of a note (each with its graph, its block and its query text; a block meant as a
  view with no name, a name that is not one word, or a name already used in its graph is listed with a `fault`, never
  skipped), and `readingOf` says a view in plain English ("everything within 2 steps of Alice").
- `view-profile.ts` — the view profile: `parseView` reads the five shapes of query (a hand-picked set, everything near a
  thing, how one thing reaches another, only some kinds, a walked path) into a `ViewSpec`, and refuses anything else with
  a message that names the five shapes in words and shows the nearest one's form (`VIEW_NAMES`, `VIEW_FORMS`). The
  queries are ISO GQL that Grafeo runs as written. A thing is named by its `id` property, which the reader writes into
  every node it gives Grafeo and the core's world keys every node by. Several kinds are written after `IS`
  (`(n IS Person|Team)`), because Grafeo does not read `(n:Person|Team)`; a colon takes one kind. A name the query gives
  a thing or a route is never a word `reserved-words.ts` keeps from names, and a kind is never one it keeps from kinds;
  `viewQuery` refuses such a kind with a RangeError that says why.
- `reserved-words.ts` — the words a view may not use, in any case. As a name: GQL's reserved and pre-reserved words
  (ISO/IEC 39075:2024 §21.3) and its truth values (§21.2), as the openGQL grammar lists them, and the words GQL leaves
  free that Grafeo 0.5.43 refuses as a name, NaN and Inf among them (`GRAFEO_REFUSED`). As a kind, which is a label: only
  the fewer words Grafeo refuses as a label (`GRAFEO_REFUSED_KINDS`), so Path, Match and Nothing may still be kinds. The
  Python library's `test_view_parity.py` holds both Grafeo lists to Grafeo, from a word list of its own. A refusal says
  only that GQL keeps the word, and suggests another.
- `view-write.ts` — `viewQuery` writes the query for a view built by tapping, always one `parseView` reads back to the
  same view (steps held to 1 to 3 near and 1 to 6 reaching; a long set of names goes over lines), and `viewBlock` writes
  the whole block. `makeView` makes a view's block (the entry exports it, not those two) and says in words what no query
  can say; `addView` is the one way a host writes one into a note, after its graph's last block, against the note as it
  is then: it refuses a view of a thing only suggested there ("accept its name first") and a name another view has.
- `view-evaluate.ts` — `evaluate` puts a view to a graph of a reading, never to a copy of it, and gives its things, its
  links (indexes into the links the graph draws) and, when nothing matches, `empty` with a sentence saying so and what to
  change. A route of up to k steps is a walk, as Grafeo takes it (a link may be used again), found by two breadth-first
  searches. The things were compared with Grafeo's answers for the same queries on random graphs, and are held to them
  by one table, `python/graph_spec/tests/view_cases.json`, which `test/view-parity.test.js` holds the core to and the
  Python library's `test_view_parity.py` holds Grafeo to.

## Graph sources and graph steps (spec §20; §7 view_of_another_note)

A graph may be written somewhere other than the note that draws it, and a step works out a graph from graphs. Neither
is data of the note it is written in: `blocks.ts`'s `isSourceBlock` keeps a FROM block out of `dataKind` (the Python
reader's `data_kind` does the same), and a step is a query block, so the note reads the same with them or without. Both
are known by their graph line alone (`isSourceBlock`, `isStepBlock`), so a long block is never read to decide it.

- `sources.ts` — a block whose graph line says FROM and a place, `// graph: trip · FROM Graphs/trip.gql` or
  `· FROM [[Trip plan]]`, draws its graph from that .gql file or note (`sourceOf`, `sourceFor`; a place that is neither,
  or a block holding lines of its own, is a fault, so data is never copied in; so is a place that could leave the vault
  or reach what it hides: a leading slash or backslash, a drive letter, a `..` part or any part starting with a dot).
  The host fetches the text (`Fetched`: found, unreadable, too large by the size it keeps and so never read, or missing
  with any file of the same name `elsewhere`); `readSource` reads it as a note's own
  blocks are read, by `readNote`, so the same partial reader and limits hold (a .gql file is one block, its CRs taken
  off), or refuses in a sentence naming the place: missing, moved, unreadable, no graph line, or no such graph (a note
  that draws it FROM elsewhere itself is named, with where to point instead). `lineInSource` is a problem's line there.
- `steps.ts` — a step is a query block `// graph: <graph> · QUERY step <name>`, its named points declared above its rule
  (`// takes <point>: (:Kind), [:TYPE]`); `stepOf` reads one or says what to change (no name, longer than
  `MOST_STEP_CHARACTERS`, refused before its rule is read, no point, a rule matching a kind or type no point takes). `runStep` runs it only when a host asks, on the note as it is: the step's fault, a
  graph the note does not write, and each input are checked first, and any refuses the run; the links its INSERT names
  for every match are its output graph, and those its graph lacks are a proposal from the step (`makeProposal`,
  `linkChange`, `thingChange` for an end the graph lacks, `basisOf`), id `<step>_<n>`, each with the match that found
  it as its reason. Nothing is written: the host writes the proposal beside the graph (`noteWithProposal`).
- `steps-rule.ts` — the rule, a GQL query over graph data and never code or a named action: MATCH one pattern (things
  with an optional name, kind and properties, joined by up to `MOST_PATTERN_LINKS` links, one way or either), then
  INSERT links between things it named. CALL, a function, SET or DELETE and the other writes, RETURN, and anything that
  reads as code are refused, each saying why and showing `RULE_FORM`. `ruleTokens` reads a rule once: a text ends at
  its line, and nothing after the first mark that cannot be read is read (spec §9).
- `steps-match.ts` — every match of the pattern, as GQL matches a path: each link once in a match, a name used twice the
  same thing; bounded by `MOST_MATCHES` and `MOST_TRIES` (every thing and link looked at, fitting or not), past which it
  stops and says so (spec §9).
- `steps-input.ts` — what is given at a point: a graph of the note, whole, or a view of one (a queried path among them),
  put to the reading as `evaluate` puts it, never a copy; `inputFaults` checks each against its point (every kind and
  type it takes held, something given) before the step runs; `together` reads the inputs as one graph, a thing by id.
