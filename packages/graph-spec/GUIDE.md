# Where things live in packages/graph-spec

The graph spec checker in plain JavaScript: it reads GQL blocks in the document profile and runs the spec's rules. It
follows `python/graph_spec` function for function, and the parity tests hold the two to the same answers.

## The entry point, and the built file

- **`src/graph-spec-check.js`** is the entry point. It requires the feature modules below and exports the one API
  object (`test/graph-spec-check-api.test.mjs` holds its names). The core imports it as `@graph-note/graph-spec`, and
  the plugin's esbuild bundles it from here.
- **`dist/graph-spec-check.js`** is the built file: every module in one self-contained script that sets the global
  `GraphSpecCheck` in a page and is the module under `require()`. `npm run build` (here, or at the root) makes it with
  `esbuild.check.mjs`. It is generated — **never hand-edit it**; change the modules in `src/` and build again. `dist/`
  is not committed.
- **The release archive** ships the built file at `packages/graph-spec/src/graph-spec-check.js`, the path the vault
  vendors and inlines into its pages, in place of the entry point (`.github/workflows/release.yml`).
- `test/graph-spec-check-built.test.mjs` builds it and proves it answers as the modules do: as a page's script, through
  `require()`, and through `bin/` laid out as in the archive.

## The feature modules, in `src/`

Each folder holds one feature; each file opens with a line saying what it does. A module requires only what it uses,
and no module requires one that requires it back.

- **`src/values/`** — the values the profile reads and how they order: `times.js` (DATE and DATETIME, and comparing
  values), `order.js` (the shared sort orders).
- **`src/hashing/`** — `sha256.js` (SHA-256, synchronous, no platform crypto) and `canonical-json.js` (RFC 8785 JSON,
  `hash16`, `basisHash`).
- **`src/reader/`** — the document profile reader (`gql_profile.py`): `profile-error.js`, `whitespace.js` (whitespace
  as GQL names it, the one set every reader uses), `tokens.js` (the header line and tokens), `parser.js` (one block's
  statement), `syntax.js` (a block's syntax alone), `store.js` (the store, its corrected text — the colons and commas the reader
  read in, written where it read them, as `store.py` writes them — and `read`).
- **`src/graph/`** — `graph.js`: the plain graph the rules run on, the world made from a store, and `canon`.
- **`src/rules/`** — the spec's rules (`graph_rules.py`): `types.js` (§5), `projection.js` (§18), `certainty.js` (§20),
  `paths.js` (§22), `lenses.js` (§15), `judgements.js` (§23), `servings.js` (§24), `completeness.js` (§25),
  `readings.js` and `guessed-readings.js` (a relationship type's readings, declared or guessed), and `check.js`, which
  runs every rule that applies to a graph.
- **`src/changesets/`** — §24 H1: `dialect-lint.js` (the traps in model-written GQL) and `changeset.js` (checking a
  change set against its base).
- **`src/joins/`** — §21 joins (`graph_spec.py`): `python-text.js`, `normalise.js`, `named-rules.js`, `validate.js`,
  `claims.js`, `union.js`, `merge3.js`, `finish.js`, and `join-docs.js`, which answers a join request end to end.
- **`src/views/`** — `mermaid.js` (relationships, legend and paths as Mermaid text) and `views.js` (every view of a
  graph at once).

## Beside them

- **`src/graph-layout.js`** — the Graphviz layout source, byte-identical to `graph_svg.py`, with its optional
  `suggested` keys: boxes drawn under a suggested name, dashed and labelled from the style's `suggested_style` and
  `suggested_label`. Still one UMD file.
- **`src/graph-spec.d.ts`**, **`src/graph-layout-types.d.ts`** — the types the TypeScript in `packages/core` uses.
- **`bin/graph-spec-check-node.js`** — the Node adapter: one JSON request on stdin, one answer on stdout. The vault's
  conformance suite and the Python parity tests run the checker through it.
- **`test/`** — `cases.mjs` and `expected.json` are the recorded characterisation cases; each test file is named after
  the module it tests, or listed in `CONTRIBUTING.md` as one that spans modules.
