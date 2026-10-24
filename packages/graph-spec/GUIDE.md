# Where things live in packages/graph-spec

The graph spec checker in plain JavaScript: it reads GQL blocks in the document profile and runs the spec's rules. It
follows `python/graph_spec` function for function, and the parity tests hold the two to the same answers.

The spec itself is [`requirements/graph-spec.gql`](../../requirements/graph-spec.gql): every section the code cites as
§3, §24 and so on, with each rule's own words. A citation of the editor's spec says "editor spec" (ARCH-11).

## A first call

[`examples/js/read-and-check.cjs`](../../examples/js/read-and-check.cjs) reads one graph block and checks it, in ten
lines. Run it with `node examples/js/read-and-check.cjs`. CI runs it from the release archive's layout on every pull
request, so it always works with the library as shipped.

## The entry point, and the built file

- **`src/graph-spec-check.js`** is the entry point. It requires the feature modules below and exports the one API
  object (`test/graph-spec-check-api.test.mjs` holds its names). The core imports it as `@thoughtknot/graph-spec`, and
  the plugin's esbuild bundles it from here.
- **`dist/graph-spec-check.js`** is the built file: every module in one self-contained script that sets the global
  `GraphSpecCheck` in a page and is the module under `require()`. `npm run build` (here, or at the root) makes it with
  `esbuild.check.mjs`. It is generated — **never hand-edit it**; change the modules in `src/` and build again. `dist/`
  is not committed.
- **The release archive** ships the built file at `packages/graph-spec/src/graph-spec-check.js`, in place of the entry
  point (`.github/workflows/release.yml`). That is the path the vault vendors and inlines into its pages.
- `test/graph-spec-check-built.test.mjs` builds it and proves it answers as the modules do. It checks it as a page's
  script, through `require()`, and through `bin/` laid out as in the archive.

## The feature modules, in `src/`

Each folder holds one feature; each file opens with a line saying what it does. A module requires only what it uses,
and no module requires one that requires it back.

- **`src/values/`** — the values the profile reads and how they order: `times.js` (DATE and DATETIME, and comparing
  values), `order.js` (the shared sort orders).
- **`src/hashing/`** — `sha256.js` (SHA-256, synchronous, no platform crypto), `canonical-json.js` (RFC 8785 JSON,
  `hash16`, `basisHash`) and `named.js` (a hash written with its algorithm's name, `requirements/hashes.md`).

### The reader and the graph

- **`src/reader/`** — the document profile reader (`gql_profile.py`). Its files:
  - `profile-error.js`, with `problem-codes.json`. That file holds the stable code of every problem the reader raises:
    `GN` and three digits, never reused. The code is the same from the Python reader and is given as the diagnostic's
    code (editor spec §42, problem_codes). `test/problem-codes.test.mjs` holds each raise to it.
  - `whitespace.js` — whitespace as GQL names it, the one set every reader uses.
  - `tokens.js` (the header line and tokens), `parser.js` (one block's statement), `syntax.js` (a block's syntax alone).
  - `owned-comments.js` — the `///` notes and `//@` lines each element owns (§26 and §27). It is held with the Python
    reader to `test/owned-comment-cases.json`.
  - `notes.js` — each note's text and summary (editor spec §24). It also finds the lines holding more than one element
    that a note above belongs to none of. It is held with the Python reader to the same table.
  - `store.js` — the store, its corrected text and `read`. The corrected text is the colons and commas the reader read
    in, written where it read them, as `store.py` writes them.
- **`src/graph/`** — `graph.js`: the plain graph the rules run on, the world made from a store, and `canon`.

### The rules, change sets, joins and views

- **`src/rules/`** — the spec's rules (`graph_rules.py`). Its files:
  - `types.js` (§5), `projection.js` (§18), `certainty.js` (§20), `paths.js` (§22), `lenses.js` (§15).
  - `judgements.js` (§23), `servings.js` (§24), `completeness.js` (§25).
  - `readings.js` and `guessed-readings.js` — a relationship type's readings, declared or guessed.
  - `provenance.js` — W3C PROV is normative. §11: a HAD_PLAN goes to a Rule. §24: an attribution goes to a Person,
    Organization or SoftwareAgent. §12: a successor is generated after what it supersedes.
  - Also in `provenance.js`: `hadPlan` and the unknown activity mark a cache (§24). The unknown activity is one with
    neither a plan nor an agent, and it gets a warning.
  - `proposers.js` — who proposed a Proposal, through WAS_ATTRIBUTED_TO (`proposer-cases.json`). The old
    ASSOCIATED_WITH form is accepted with a warning.
  - `check.js`, which runs every rule that applies to a graph.
- **`src/changesets/`** — §24 H1. Its files:
  - `dialect-lint.js` — the traps in model-written GQL.
  - `changeset.js` — checking a change set against its base.
  - `changes.js` — the DELETE and SET statements of a change set, each naming one target, read and applied. It is held
    with the Python reader to `test/change-cases.json`.
  - The API also gives `splitChangeset`, `readChange` and `changeId`. So the editor reads a statement and names a change
    as the check does.
- **`src/joins/`** — §21 joins (`graph_spec.py`): `python-text.js`, `normalise.js`, `named-rules.js`, `validate.js`,
  `claims.js`, `union.js`, `merge3.js`, `finish.js`, and `join-docs.js`, which answers a join request end to end.
  `trust.js` holds a union to each document's trust. Only own and trusted ones count, and an id prefix has an owner
  (req:21.trust-counted, req:21.prefix-owner).
- **`src/views/`** — `mermaid.js` (relationships, legend and paths as Mermaid text) and `views.js` (every view of a
  graph at once).
### Clusters and the mesh

- **`src/clusters/`** — clusters (editor spec §31) and the groups a massive graph opens as (editor spec §53). Python's
  twins give the same answers. Its files:
  - `louvain.js` — the one method that finds groups by how things link (`test/louvain-cases.json`).
  - `clusters.js` — a graph's written and found clusters. Each membership says its kind and counts 1/N for a thing in N
    clusters (`test/cluster-cases.json`).
  - `centroids.js` — each cluster's centroid, which sums it up. Centroids nest, keep their ids after a rebuild and are
    worked out again only when their members change. One still moving is flagged unsettled (`test/centroid-cases.json`).
  - `cycles.js` — clusters inside each other in a cycle. A cycle is flagged, never refused, and a view hides or
    highlights it (`test/cycle-cases.json`).
- **`src/altitude/`** — altitude and audience profiles (editor spec §32). Python's twin gives the same answers.
  - `altitude.js` — altitude as a query parameter: parts over the level open, those at or under it show as one thing,
    and links are bundled. It also has audience profiles by three criteria and projections per domain. A thing's level
    in each lens is a link, and the two axes filter apart or together (`test/altitude-cases.json`).
- **`src/mesh/`** — the graph mesh (editor spec §27 to §30). Python's twins give the same answers.
  - `mesh-join.js` — graphs from many notes joined, built on `src/joins/`, with what the join found. Each clash keeps
    both sides, and the gaps are listed. Each claim has its certainty in words, ranked by a key made from them, never
    typed. A dispute lowers only the thing disputed, and a link to a contested thing is marked. A hand-made cluster
    can be contested, and same-named states match only as a guess (`test/mesh-join-cases.json`).
  - `as-at.js` — a graph as at a date, so a lens answers as it was then (`test/two-times-cases.json`). Recorded time
    is `recorded_at`, and SUPERSEDES. Real-world time runs from `valid_from` up to `valid_to`.
  - `after-text-merge.js` — two edits joined over their base, and their text merge read against that join. A value
    the merge picked in a dispute is listed for a person, never taken as the decision (`test/join-every-author-cases.json`).
  - `same-as.js` — which things in different graphs are one (ARCH-6). Inside a graph the name is the id. Across graphs
    only a written SAME_AS link to a Ref joins two things; the same name with no link stays a guess
    (`test/same-as-cases.json`).
  - `types-instances.js` — lasting types and their instances. An instance links to its type with INSTANCE_OF, here or
    through a Ref, and has its type's properties unless it sets its own (`test/types-instances-cases.json`).

## Beside them

- **`src/graph-layout.js`** — the Graphviz layout source, byte-identical to `graph_svg.py`. Still one UMD file.
  - Its optional `suggested` keys: boxes drawn under a suggested name, dashed and labelled from the style's
    `suggested_style` and `suggested_label`.
  - `typedSource` — that source laid out as a diagram type by the core's plan (editor spec §15), with `typeDirection`.
    It is byte-identical to the Python library's `diagram_types.typed_source`.
- **`src/graph-spec.d.ts`**, **`src/graph-layout-types.d.ts`** — the types the TypeScript in `packages/core` uses.
- **`bin/graph-spec-check-node.js`** — the Node adapter: one JSON request on stdin, one answer on stdout. The vault's
  conformance suite and the Python parity tests run the checker through it.
- **`test/`** — `cases.mjs` and `expected.json` are the recorded characterisation cases. Each test file is named after
  the module it tests, or listed in `CONTRIBUTING.md` as one that spans modules.
