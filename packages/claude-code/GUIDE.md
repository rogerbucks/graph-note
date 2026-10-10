# The Claude Code host: where things live

A Claude Code mod whose `/graph <note>` draws the note's first graph in a pane (spec §10, Hosts), on the same host-free
core as the Obsidian plugin. A mod's hooks run in an environment of their own, with no DOM, no Node and no WebAssembly:
reading, the layout source and theming run there, bundled; Graphviz, the core's own engine, runs as a process through
`node`, DOT in and SVG out. When `node` is missing, the pane says so and shows the graph as text, never a blank drawing.
A pane draws the SVG as an isolated image, so its colours are the core's fixed light or dark palette (`palette.ts`, the
one colour mapping), chosen by Claude Code's theme setting, with the page painted in.

## The source, `src/`

- `graph-view.ts` — `viewOf`: what the pane shows for a note. The first graph drawn in a palette, and always the same
  graph as lines of text, which stand in, with the reason, when it cannot be drawn: over the layout limits, over what a
  pane takes, or Graphviz not run. A note too large to read, a graph that could not be read (its errors, with their note
  lines) and an empty graph each say so, never "no graph". Also `paletteFor` (the theme setting to a palette) and
  `notePath` (/graph's argument).
- `graphviz-process.ts` — `layOut`: the DOT sources handed to the render script through node, within the core's time
  limit (`LAYOUT_TIMEOUT_MS`), and the SVGs back. After a refused run, `node --version` is asked: a node that is not
  there (ENOENT, "not found") or exit code 127 is said as `NODE_MISSING`, in words with what to do; a host that runs no
  process says its own words; a node that starts means the layout did not finish.
- `mod-entry.ts` — what the hooks module takes from the two above; bundled into `mod/hooks/graph.js`.

## The process, `bin/`

- `bin/render-process.ts` — the core's `loadEngine`, run by node: a JSON list of DOT on stdin, a JSON list of SVG on
  stdout. Bundled into `mod/bin/render.mjs`.

## The mod, `mod/`

The folder Claude Code loads (`--plugin-dir`). It is checked by Claude Code, not by the repository's linter: run
`claude plugin validate packages/claude-code/mod` and `claude plugin test packages/claude-code/mod` before a merge
that touches it. CI has no Claude Code, so it runs neither: what the pane shows is decided in `src/`, which CI tests,
and `register.tsx` stays thin.

- `.claude-plugin/plugin.json` — the manifest, named `graph-note`.
- `hooks/register.tsx` — the hooks module: registers `/graph`, reads the note with `$.fs.read`, runs Graphviz with
  `$.process.run`, keeps the view in `$.state`, and draws the pane: `Svg` on the desktop, VS Code and mobile; the
  reason and the text on the terminal (which draws no `Svg`) or wherever no drawing could be made.
- `hooks/graph.d.ts` — the types of the bundle, its source's own.
- `types/index.d.ts` — the mod's state contract, self-contained as Claude Code requires.
- `tests/graph.test.tsx` — the mod in its own environment, with `claude plugin test`: the test vault's sample note drawn
  on each surface, and node missing.

Built, never edited (gitignored): `mod/hooks/graph.js`, `mod/bin/render.mjs`, `mod/tests/fixtures.js`. Claude Code writes
`mod/.claude-plugin/types/` when it loads the mod; `mod/tsconfig.json` extends it, so `tsc -p packages/claude-code/mod`
type-checks the mod once it has been loaded.

## Build and tests

- `npm run build --workspace packages/claude-code` (`esbuild.config.mjs`) builds the mod, and its test fixtures from
  `test-vault/Sample graph note.md`. The root `npm run build` runs it.
- `test/` runs in the repository's suite: `graph-view.test.js`, `graphviz-process.test.js`, and `build.test.mjs` (the
  build writes a hooks bundle with no WebAssembly engine, under 1 MiB, and a render script that draws).
