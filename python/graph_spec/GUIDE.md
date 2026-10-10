# Where things live — the Python library

A host puts `src/` on `sys.path` and imports the four entry points by name. Each re-exports every name it has always had, from where it lives now; the code is in `src/graphspec/`, one feature to a module.

## The entry points, in `src/`

- `gql_profile.py` — reads data blocks in the document profile (§3) into a plain graph, with no database.
- `graph_rules.py` — the spec's rules on that plain graph.
- `graph_spec.py` — the rules through Grafeo, for the conformance suite; a setting a host assigns here is forwarded to `src/graphspec/engine/settings.py`.
- `graph_svg.py` — lays a graph out with Graphviz as themed SVG; its style is `graph_svg.style.json` beside it. `dot_source` and `render` take the keys of boxes drawn under a suggested name (`suggested`, from the warnings `read_for_drawing` lists), dashed and labelled as the core draws them. Small enough to stay one module.

## The code, in `src/graphspec/` (namespace packages: folders, no `__init__.py`)

- `src/graphspec/reader/` — gql_profile's: whitespace as GQL names it, never `isspace()` or `splitlines()` (`whitespace`), tokens and header (`lexer`), `grammar`, the `store`, `to_gql`, drawing in part (`drawing`), a block's items (`block_items`), `canonical_hash`, `syntax_check`; and, as the plugin's core does, the things written in a block (`written_things`), a name suggested from a text (`name_suggestions`) and the names suggested for things written without one, which drawing reads them under (`name_gaps`). `tests/name_cases.json` holds them and the core to one table.
- `src/graphspec/rules/` — graph_rules's: `plain_graph`, `canonical_json`, §5 `schema_types`, §18 `projection`, §20 `likelihood`, `certainty` and `certainty_checks`, §22 `paths`, §15 `lens`, §23 `judgements` and `judgement_checks`, §24 `servings` and `changesets`, §25 `completeness`, `graph_check` (every rule on one graph), `views`, `guessed_readings`.
- `src/graphspec/engine/` — graph_spec's: host `settings`, `optional_imports` (Grafeo, PyYAML, lxml, rfc8785, loaded on first use), Grafeo `queries`, §18 `projection`, §5 `schema`, §22 `paths`, §24 H1 `dialect_lint` and `embedded_queries`, §24 H4 `changesets`.
- `src/graphspec/engine/documents/` — a document's GQL block read (`reading`), the hash filler (`fill`), the classification note (`classification`).
- `src/graphspec/engine/joining/` — §21: `config`, `restating`, `breaches`, `claims`, `union`, `merge3`, `finish` (and join, join3), `audit` (held, lost, invented), `emit`, `named_rules`, `gql_rules`.
- `src/graphspec/engine/process/` — §7, §16: the process engine (`machine`) and its SCXML export (`scxml`).
- `src/graphspec/engine/certainty/` — §20: the likelihood `scale`, cached values (`caches`), `track_record`, `checks`.
- `src/graphspec/engine/judgements/` — §23: `basis` and its hashes, `review`, `checks`.
- `src/graphspec/engine/serving/` — §24 H3: the `view_server` and its `checks`.

## Tests, in `tests/`

`test_reader_agrees_with_grafeo.py` holds the reader and its plain rules to Grafeo's answers (req:17.engine-agreement), on the shared cases and on generic cases in `tests/agreement/` (one JSON file per area, each block a list of lines; `classification.md` there is a generic destination matrix). Grafeo is the reference only: a test dependency, never one the readers need.

Otherwise named after the module they test. `test_<entry point>_entry_point.py` hold each entry point to every name it had (`entry_points.json`) and to importing with only `src/` on the path.
