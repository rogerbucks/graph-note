# Where things live — the Python library

A host puts `src/` on `sys.path` and imports the four entry points by name. Each re-exports every name it has always
had, from where it lives now; the code is in `src/graphspec/`, one feature to a module.

## A first call

[`examples/python/read_and_check.py`](../../examples/python/read_and_check.py) reads one graph block and checks it.
Run it with `uv run --project python/graph_spec python examples/python/read_and_check.py`. CI runs it from the release
archive's layout on every pull request, so it always works with the library as shipped.

## The entry points, in `src/`

- `gql_profile.py` — reads data blocks in the document profile (§3) into a plain graph, with no database. It also reads
  a graph's style blocks into its nudges (`read_style`, editor spec §6), as the plugin's core reads them.
- `graph_rules.py` — the spec's rules on that plain graph.
- `graph_spec.py` — the conformance suite's entry point. It reads, checks, runs processes, serves views and fills
  hashes. It does so from the reader's reading by default, and through Grafeo when a host sets `PARSER = 'grafeo'`
  (database work only). A setting a host assigns here is forwarded to `src/graphspec/engine/settings.py`.
- `graph_svg.py` — lays a graph out with Graphviz as themed SVG. Its style is `graph_svg.style.json` beside it.
  - `dot_source` and `render` take the keys of boxes drawn under a suggested name (`suggested`, from the warnings
    `read_for_drawing` lists). Those boxes are dashed and labelled as the core draws them.
  - `nudged_source` writes a graph's nudges into the source. It lives in `graphspec/style/nudges`, re-exported here.
  - `directions` gives the directions laid out, only the one a direction nudge sets, as the core's `style-source.ts`
    and `render.ts` do. `render` takes the `nudges` and `direction` that `read_style` gives (python_honours_nudges).
  - `arrowless_source` and `inline_source` (from `graphspec/style/`) write the arrowheads a style hides and the
    properties it shows into the source. They come before the nudges, and `render` takes them as `arrowless` and
    `inline` (arrows_both_renderers).
  - `flow_source` writes the links a Flow moves, first after the diagram type. `render` takes them as `flow`
    (links_show_flow).
  - `typed_source` (from `graphspec/style/diagram_types`) lays the source out as the diagram type chosen, before all of
    those. `render` takes its plan as `diagram`. `directions` lives there too, re-exported here (type_both_renderers).
  - `folded_source` and `routed_source` (from `graphspec/style/fold_source`) write what a View menu folds and merges,
    and how links are routed (editor spec §25). They come last, and `render` takes them as `folding` and `routing`.
  - `drawn_source` is the whole source `render` lays out in one direction, every step in the core's order.
  - `picture_source` (from `graphspec/style/picture`) keeps room at the top of each box a Picture draws an image on.
    The room is a square marked for a host to fill. It comes after the properties shown and before the nudges and
    folds. `render` takes those boxes as `pictures` (animated_image_shown; graph_svg loads no image).

## The code, in `src/graphspec/` (packages: each folder's `__init__.py` says what it holds)

- `src/graphspec/reader/` — gql_profile's. Its modules:
  - `whitespace` — whitespace as GQL names it, never `isspace()` or `splitlines()`.
  - `lexer` (tokens and header), `grammar`, the `store`, `to_gql`.
  - `drawing` — drawing in part. As the core's `blocks.ts`, it never reads a block drawn `· FROM` a file or a note as
    data.
  - `block_items` (a block's items), `canonical_hash`, `syntax_check`.
  - Each `ProfileError` with its stable code. The code is passed as a literal from
    `packages/graph-spec/src/reader/problem-codes.json`, which the library never reads (editor spec §42, problem_codes;
    `tests/test_problem_codes.py`).
  - `owned_comments` — the `///` notes and `//@` lines each element owns (§26 and §27). It is held with the JavaScript
    reader to `packages/graph-spec/test/owned-comment-cases.json`.
  - `notes` — each note's text and summary, and the lines a note above belongs to none of (editor spec §24). It is held
    to the same table, and to the JavaScript reader run live by `tests/test_notes.py`.
  - As the plugin's core does: the things written in a block (`written_things`) and a name suggested from a text
    (`name_suggestions`).
  - `name_gaps` — the names suggested for things written without one, which drawing reads them under.
    `tests/name_cases.json` holds them and the core to one table.

### Style

- `src/graphspec/style/` — gql_profile's `read_style` (editor spec §2, §6, §14, §15, §18). It follows the core's
  `style.ts` step for step, as far as what graph_svg draws goes. Its parts:
  - A graph's style blocks (`style_of`, in `reader/drawing`, which never reads one as data), read with
    `read_for_drawing`, with each thing's kind and keys.
  - `checks` — each nudge, Show, Arrows, Diagram, Flow, Links and Picture, checked against the graph.
  - `conflicts` — those same nudges and blocks checked against each other.
  - `near_names` — the fixes' nearest names, counted in UTF-16 units as JavaScript counts.
  - `words` — the words and keys.
  - `arrows` — the arrowheads a drawing hides (the core's `arrows.ts`).
  - `flow` — the links a drawing moves and how (the core's `link-flow.ts`). Each moving link's label is opened by its
    icon and marked with the classes a style sheet moves it by. The SVG graph_svg writes is still, as the plugin draws
    under reduced motion.
  - `inline` — the properties a drawing shows inline (the core's `inline-properties.ts`). Each value is said as
    JavaScript says it, and a long one is cut short.
  - `picture` — the boxes a Picture draws an image on and the room kept for it (the core's `picture.ts`).

### Style: the legend, diagram types, folding and drawing

- `src/graphspec/style/`, continued:
  - `legend` — the legend's choices a view was saved as shown with (the core's `untangle-saved.ts` and
    `LegendFilter.apply`). It reads and checks a Shown's `legend`, each fault the core's problem.
  - `legend_layers` gives the same sets of things and links the choices bring forward and hide in a drawing
    (untangle_legend). Applying them is the plugin's alone, and graph_svg draws none.
  - `diagram_types` — which diagram types fit a graph and why not, the one drawn, and each laid out (the core's
    `types.ts` and graph-layout.js `typedSource`). The one drawn is the chosen one while it fits, else a network, with
    the nearest that fits. A type a plug-in adds, such as `acme.charts.sankey` (`words.plugin_type_of`), is drawn as a
    network, naming its plug-in (plugin_diagram_type_named).
  - In `diagram_types`, the table is the plugin's to draw. So here it is drawn as a network, and `render_args` says so
    on stderr.
  - `nudges` — the nudges written into the source.
  - `folding` — folding (the core's `untangle-fold.ts` and the switches of `view-switches.ts`): `BUSY_HUB`,
    `fold_plan`, `drawn_groups`, `links_of` and `starting_switches`.
  - `starting_switches` gives the switches a graph starts with. They follow the plugin's default settings, the style
    graph's Links merging its links, and the way a view was saved as shown.
  - `fold_source` — the plan written into the source: a hub's stub, a group's box, trunks between groups, and the links
    routed.
  - `drawn` — a graph ready to draw. Its parts:
    - `graph_parts` — its boxes and written links as the core chooses them. Each link is in its schema's words (its
      own or a shared one's), with their properties.
    - `render_args` — what `graph_svg.render` draws a graph with, as the plugin draws it in a view or the whole graph,
      style and routing and all. It folds only when switches are given; as an export and the Claude Code pane, it
      folds nothing by default. It never takes the links the plugin guesses from a near miss. graph_svg re-exports it.
  - Look and ViewStyle are drawn by the plugin alone, so only their keys are checked here. Of a Shown, its view and the
    switches it was saved with are checked too, as graph_svg draws them.

### Style: drawing marks

- `src/graphspec/style/marks` — Graphviz's layout as drawing marks, the one picture format every diagram type gives back
  (plugin_interface). It is the core's `graphviz-marks.ts` step for step.
- `layout_marks` reads a layout Graphviz gives as JSON (`dot -Tjson`). It runs no Graphviz itself.
- `marks_json` holds the style token for each stand-in colour, and reads an arrowhead (the core's `graphviz-json.ts`).
  `marks_links` reads each link and the order Graphviz writes it in.
- Each mark is a dict with the core's own keys, such as `maxWidth`, so the two can be compared as they are.

### Rules and the engine

- `src/graphspec/rules/` — graph_rules's. Its modules:
  - `plain_graph`, `canonical_json`, §5 `schema_types`, §18 `projection`, §20 `likelihood`, `certainty` and
    `certainty_checks`.
  - §22 `paths`, §15 `lens`, §23 `judgements` and `judgement_checks`, §24 `servings` and `changesets`.
  - §24 `changes` — the DELETE and SET statements of a change set, each naming one target. `change_apply` applies
    them, refusing a record or a cache, and writes the GQL Grafeo is given. They are held with the JavaScript reader to
    `packages/graph-spec/test/change-cases.json` by `tests/test_changes.py`.
  - §25 `completeness`.
  - `proposers` — who proposed a Proposal, through WAS_ATTRIBUTED_TO. The old ASSOCIATED_WITH form is accepted with a
    warning. It is held to `proposer-cases.json` by `tests/test_proposers.py`.
  - `provenance` — W3C PROV is normative: §11 HAD_PLAN to a Rule, §24 WAS_ATTRIBUTED_TO, §12 revision order. A cache is
    anything generated by an activity that HAD_PLAN a rule, or by an unknown one. An unknown one has neither a plan nor
    an agent, and is warned of.
  - `provenance` is held with the JavaScript reader to `change-cases.json` and `test_parity.py`'s cases, and with
    Grafeo to `tests/agreement/provenance.json`.
  - `graph_check` (every rule on one graph), `views`, `guessed_readings`.
- `src/graphspec/engine/` — graph_spec's. Host `settings`, and `optional_imports` (Grafeo, PyYAML, lxml, rfc8785,
  loaded on first use). Grafeo `queries`, §18 `projection`, §5 `schema`, §22 `paths`. §24 H1 `dialect_lint` and
  `embedded_queries`. §24 H4 `changesets` (and `changeset_author`, who a set is by). The W3C PROV rules `provenance`.
- `src/graphspec/engine/documents/` — a document's GQL block read (`reading`), the hash filler (`fill`), the
  classification note (`classification`).
- `src/graphspec/engine/joining/` — §21: `config`, `restating`, `breaches`, `claims`, `union`, `merge3`, `finish` (and
  join, join3), `audit` (held, lost, invented), `emit`, `named_rules`, `gql_rules`.
  `trust` makes a union count only own and trusted documents, and gives an id prefix an owner.

### Clusters and processes

- `src/graphspec/engine/clusters/` — editor spec §31. Each module is the twin of a JavaScript one, held to its shared
  cases in `packages/graph-spec/test/`:
  - `louvain` finds groups by how things link (`louvain.js`, `louvain-cases.json`).
  - `clusters_of` gives a graph's written and found clusters, each membership with its kind and its 1/N weight
    (`clusters.js`, `cluster-cases.json`).
  - `centroids_of` gives each cluster's centroid (`centroids.js`, `centroid-cases.json`).
  - `cluster_cycles` and `cycle_view` flag the clusters in a cycle, and hide or highlight them (`cycles.js`,
    `cycle-cases.json`).
### The graph mesh and the process engine

- `src/graphspec/engine/mesh/` — editor spec §28 and §30, the graph mesh. `mesh_join.mesh_join` joins graphs as the mesh
  does and says what it found. That is each clash with both sides, the gaps, and each claim's certainty in words. It
  is also each thing's standing, the marker on links to a contested thing, contested hand-made clusters and
  same-named states held as a guess. `by_certainty` ranks claims by a key made from their words. The twin of `mesh-join.js`, held to
  `mesh-join-cases.json`.
- `src/graphspec/engine/mesh/as_at.py` — editor spec §29. `as_at` gives a graph as at a date on recorded or
  real-world time, and `lens_as_at` runs a lens on it. The twin of `as-at.js`, held to `two-times-cases.json`.
- `src/graphspec/engine/mesh/after_text_merge.py` — editor spec §30. `after_text_merge` joins two edits over their
  base and reads their text merge against it. Each value the merge picked in a dispute is listed for a person. The
  twin of `after-text-merge.js`, held to `join-every-author-cases.json`.
- `src/graphspec/engine/mesh/same_as.py` — editor spec §27, ARCH-6. `same_as` says which things in different graphs a
  written SAME_AS link makes one. The same name with no link stays a guess. The twin of `same-as.js`, held to
  `same-as-cases.json`.
- `src/graphspec/engine/mesh/types_instances.py` — editor spec §27. `type_of`, `instances_of` and `inherited`: an
  instance links to its type with INSTANCE_OF and has its type's properties unless it sets its own. The twin of
  `types-instances.js`, held to `types-instances-cases.json`.
- `src/graphspec/engine/mesh/contexts.py` — editor spec §61. `contexts_of`, `context_guesses`, `comparable`,
  `propose_same_as`, `same_as_across`, `world_in` and `search_contexts`: where links may join. The twin of
  `contexts.js`, held to the same worlds by `tests/test_contexts.py`.
- `src/graphspec/engine/process/` — §7, §16: the process engine (`machine`) and its SCXML export (`scxml`).
  - `to_scxml` is given the block the process is written in. It keeps each `///` note on a State or a transition as an
    XML comment directly before its element (editor spec §24, note_standard).
  - A transition's note is found by the order the block writes it in, never the order a source gives its rows in.
  - The comment is written by `note_comment` as the core's `xml-comment.ts` writes one, and read back by
    `comment_note`. `tests/note_comment_cases.json` holds both languages to one table, and `tests/test_scxml.py` reads
    the export back.
- `src/graphspec/engine/certainty/` — §20: the likelihood `scale`, cached values (`caches`), `track_record`, `checks`.
- `src/graphspec/engine/judgements/` — §23: `basis` and its hashes, `review`, `checks`.
- `src/graphspec/engine/serving/` — §24 H3: the `view_server` and its `checks`.

## Tests, in `tests/`

`test_reader_agrees_with_grafeo.py` holds the reader and its plain rules to Grafeo's answers (req:17.engine-agreement).
It runs on the shared cases and on generic cases in `tests/agreement/`: one JSON file per area, each block a list of
lines. `classification.md` there is a generic destination matrix. Grafeo is the reference only: a test dependency,
never one the readers need.

Grafeo is not installed by a plain install (req:14.no-engine-install). It is the `grafeo` extra, for database work, and
the `reference` dependency group of a working copy. A test that needs it uses `engine_support.needs_engine`, or
`module_needs_engine` in `setUpModule`. Such a test is skipped without Grafeo, as CI's `python-no-engine` job runs
(`uv sync --locked --no-default-groups`). But it is run and failed in CI's `python` job, which sets
`GRAPH_SPEC_ENGINE=required`.

`test_view_parity.py` holds Grafeo to `tests/view_cases.json`, the table of views the core's `view-parity.test.js`
holds the core to. Each view's query, run in Grafeo as written, returns the things the core returns
(views_agree_with_grafeo). The test also keeps a fixed list of GQL's and Cypher's words (never the lists it tests). Of
those words, Grafeo refuses as a name and as a kind exactly the words the core keeps from them.

### The conformance suite, in `conformance/`

The graph spec's own test suite came from the owner's vault (GS1, spec_conformance_in_repo). It runs on the code here:
this library, the portable reader and the JavaScript checker, built fresh each run.

- `Standards/` holds the spec's prose, its cases and their documents. Each case's expected answers are data, in a yaml
  block that starts `# conformance case`. Each document's `test_class` line is the class the case gives it.
- `scripts/graph_spec_conformance.py --check` runs it all. It takes about two minutes and needs Grafeo and Node.
- `tests/test_conformance_suite.py` runs it in CI, in the `python` job.
- The scripts keep the vault's own style, so Ruff leaves them out. The rules file is `requirements/graph-spec.gql`.

### Parity with the core's drawing

`test_graph_svg_nudges.py` holds graph_svg and `read_style` to the core, run live by Node, on `tests/nudge_cases.json`
(python_honours_nudges). For each note it checks the same problems reading its data and its styles. It also checks the
same source in each direction laid out, nudges written in, byte for byte. The core's `layout-parity.test.js` holds the
same from the JavaScript side.

`test_graph_svg_types.py` does the same on `tests/type_cases.json` for the diagram types (type_both_renderers). It
checks the same answer for whether each type fits and why not, the same type drawn, and the same source in each
direction.

`test_graph_svg_folds.py` does the same on `tests/fold_cases.json` (untangle_hubs, untangle_groups, untangle_merge,
untangle_routing). It covers a busy hub folded into a stub, a group into a box, links between groups merged into a
trunk, and links routed. They are folded as a card's View menu state, started from the plugin's default settings, folds
them when a case turns its switches. Nothing is folded when it does not.

For the folds, the test checks the same problems reading each Links, and the same source. Its `python_answer` is the
Python side `layout-parity.test.js` runs.

`test_graph_svg_flow.py` does the same on `tests/flow_cases.json` for links a Flow moves (links_show_flow). It checks
the same problems, links moving and source, through `render(**render_args(…))`. The core's `link-flow-parity.test.js`
runs its `python_answer`.

`test_graph_svg_picture.py` does the same on `tests/picture_cases.json` for pictures on boxes (animated_image_shown). It
checks the same problems, boxes with a picture and source. The core's `picture-parity.test.js` runs its
`python_answer`.

`test_legend.py` does the same on `tests/legend_cases.json` for the legend's choices a view was saved as shown with
(untangle_legend). It checks the same problems, the same choices read for the view, and the same things and links
brought forward and hidden. The core's `untangle-saved-parity.test.js` runs its `python_answer`.

`test_graph_svg_styled.py` does the same on `tests/style_cases.json` for arrowheads hidden and properties shown inline
(arrows_both_renderers). Each note is drawn in the view it names. It checks the same problems, links without
arrowheads, rows and source. Its `python_answer` is the Python side `layout-parity.test.js` runs.

Otherwise named after the module they test. `test_<entry point>_entry_point.py` hold each entry point to every name it
had (`entry_points.json`) and to importing with only `src/` on the path.

### Parity of the drawing marks

`test_marks.py` proves the marks, and the core's `graphviz-marks-parity.test.js` holds them to the core's. Each case in
`tests/marks_cases.json` is laid out once, and both libraries read that one layout. They give the same marks, parts and
order, numbers to a billionth.
