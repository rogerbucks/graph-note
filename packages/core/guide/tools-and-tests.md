# Command-line tools, `bin/`, and tests, `test/`

Purpose: the core's command-line tool, and how its tests are named, what they may assert, and how data exports are proved. Part of the [core guide](../GUIDE.md).

## Command-line tools, `bin/`

- `bin/layout-source-node.mjs` — writes the layout source of every graph in a set of notes, for the vault's
  conformance check. `esbuild.layout.mjs` bundles it into `dist/`.

## Tests, `test/`

Each test file is named after the module it tests (`zoom.test.js` tests `zoom.ts`; `layout-parity.test.js` tests
`layout.ts`), or, when it spans modules, is listed in `CONTRIBUTING.md`. Run one with `node --test test/<file>`, or all
with `npm test` from the repository root.

A test asserts the work done, never the time taken (spec §12, quality_ratchet, 12 Oct 2026). Where what is held is
work, such as a text never read, a block read again only within its budget or drawing instructions never written, the
test counts it with `test/reader-work.js`, paired with a control that shows the same count sees the work when it is
done: a count is the same on every machine, under load and under coverage. What the core's work costs — 50 things
drawn, the worst reads at the size limits, the refusals, naming thousands of things, a keystroke reaching the note, and
each ratio between two sizes or two cases of the same work — is counted in CPU instructions by the benchmarks in
`scripts/benchmarks/`, run under Cachegrind on every release (`scripts/instruction-counts.mjs`), never timed in a test.
`scripts/timed-assertions.mjs` finds any assertion on elapsed time, and `test/timed-assertions.test.js` fails on one.

A data export is proved by reading it back (export_lossless): `test/export-data-readers.js` reads a GQL block with the
graph-spec reader, and CSV and GraphML with strict readers of its own, as RFC 4180 and XML read them, so an escape the
writer leaves out shows. The Obsidian package's tests read its exports back with them too. They read the notes back
too (`readNotes`; note_standard): a GQL block's with the library's `notes`, a GraphML comment's escapes by a strict
reader of their own (`commentNote`); `test/notes-export.test.js` holds each format to the rule.
