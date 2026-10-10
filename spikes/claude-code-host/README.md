# Spike: the core inside a Claude Code mod

Proves whether `packages/core` runs in a Claude Code mod's hooks module (Claude Code 2.1.293), which has no DOM, no Node
and no WebAssembly. Spike code: not a host package yet, and nothing here is released.

## Verdict: partly

- **Runs in the mod**: reading a note (`gqlBlocks`, `readNote`), the layout source (`directions`), and choosing and
  theming the drawing (`chosen`). Bundled with esbuild into `mod/hooks/core.js` (190 KB, platform neutral).
- **Does not run in the mod**: Graphviz. The core's engine is `@viz-js/viz`, Graphviz compiled to WebAssembly, and a mod
  has no `WebAssembly` and no `new Function` (tested). Its bundle is also 1.6 MB, and a mod file over 1 MiB is not read.
- **So Graphviz runs as a process**: `mod/bin/render.mjs` is the core's own engine (`loadEngine`), run by `$.process.run`
  with Node on the host: DOT in, SVG out. Same core, same engine; the cost is that the host needs `node` on its path.

## Findings for the core

- `render.ts` imports `@viz-js/viz` at its top, so its pure steps (`directions`, `chosen`) cannot be bundled without it.
  The build aliases it to `src/no-viz.ts`. The smallest fix: move `loadEngine` into a module of its own.
- The themed SVG colours with Obsidian's CSS variables (`--color-orange`, `--text-normal`), which a Claude Code pane does
  not define. A host palette is needed before the drawing looks right there.
- The terminal draws no `Svg` (only `Image` and `Raster`), so the pane shows the graph's links as text there.

## Run it

```bash
node spikes/claude-code-host/build.mjs
```

```bash
claude plugin validate spikes/claude-code-host/mod
```

```bash
claude plugin test spikes/claude-code-host/mod
```

```bash
claude -p --plugin-dir "$PWD/spikes/claude-code-host/mod" "/graph"
```

The last prints `graph-view: reader: 4 things, 3 links`. `/graph <path>` draws another note.
