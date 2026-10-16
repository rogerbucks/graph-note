# The core: where things live

The host-free core of the graph note editor (spec §10): what to draw, problems and their fixes, zoom, edits and undo.
It imports no host — no Obsidian, editor or Node module — so the same code runs in Obsidian on a desktop or a phone and,
later, in VS Code. It is written in erasable TypeScript, so Node runs its tests with no build.

- `src/index.ts` is the package's one entry: everything a host uses is exported from it, and only from it.
  `test/index.test.js` holds its list of names, so a change to it is a decision, not an accident.
- Every module is flat in `src/`, one purpose each, named for it. Each opens with a comment saying what it is for.

This guide is an index. The module-by-module notes sit in `guide/`, one file per topic: read only the one you need.

- [guide/reading.md](guide/reading.md) — reading a note, problems, name gaps, notes, deferred things: read to change how a note is read.
- [guide/drawing.md](guide/drawing.md) — layout, engine, limits, theme, palette, hit testing, zoom: read to change how a drawing is laid out or zoomed.
- [guide/navigation.md](guide/navigation.md) — focus, untangle, folding, View switches, details navigation (§25): read for large graphs.
- [guide/links.md](guide/links.md) — links and attachments (§18): read to change how links are found, judged or renamed.
- [guide/editing.md](guide/editing.md) — the edit session, undo, adding things, completion, inspector, Lock: read to change an edit.
- [guide/paths.md](guide/paths.md) — walked paths, Play, animated path export: read to change paths.
- [guide/style.md](guide/style.md) — the style graph, arrows, inline properties, moving links, pictures, animated images: read to change styling.
- [guide/views.md](guide/views.md) — diagram types, views, graph sources and steps: read to change types, views or steps.
- [guide/export.md](guide/export.md) — image and data export (§16): read to change an export.
- [guide/proposals.md](guide/proposals.md) — proposed changes and their review (§17): read to change proposals.
- [guide/ai.md](guide/ai.md) — sending to an AI, classification gates, the Claude gate, settings (§19, §21): read to change what may be sent or an option.
- [guide/display-layer.md](guide/display-layer.md) — `src/display/`, the DOM half shared by the hosts: read to change the drawn card.
- [guide/tools-and-tests.md](guide/tools-and-tests.md) — `bin/` and how the core's tests are made and what they may assert: read before writing a test.
