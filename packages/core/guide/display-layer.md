# The shared display layer, `src/display/`

Purpose: the DOM half of the viewer (the drawn card, details and forms) shared by the Obsidian plugin and the Claude Code browser editor. Part of the [core guide](../GUIDE.md).

The DOM half of the viewer (editor spec §26, cc_core_only), shared by the Obsidian plugin and the Claude Code browser
editor's page: the drawn card (`src/display/graph-view/`), the details and the forms it opens. It is not part of the
host-free entry: `index.ts` exports none of it, and it is reached by the subpath `@graph-note/core/display/<module>`
(`package.json` `exports`), so a host that draws nothing, like the Claude Code mod's hooks, never bundles it. It is
DOM code, so it has a `tsconfig.json` of its own with the DOM library (`tsc -p packages/core/src/display`), and the
core's own type check leaves it out. It is bundled, never run by Node on its own, so it is not held to erasable
TypeScript; `host.ts`, `lifecycle.ts` and `dom-helpers.ts` are, because their tests load them directly. It imports no
host (`test/imports.test.js` holds it to the layer, the core by its name and the graph library) and has the host's
part come in through `host.ts`.

- `host.ts` — `DisplayHost`, what the layer asks of its host (an icon, whether the screen is a phone's, a notice, a
  menu); `installHost` once before anything is drawn, `displayHost` for the layer's own use, which throws `NO_HOST`
  rather than draw a blank.
- `lifecycle.ts` — `Lifecycle`, what a card is owned by: load, unload, children, registered clean-ups and listeners,
  as an Obsidian component does them, with no host in it. The Obsidian plugin wraps one (`adopt`) where it needs its own
  kind of component.
- `code.ts` — a block that is not a graph, as coloured code with a copy button.
- `fix-changes.ts` — `withFix`: a fix's edits applied to text; no DOM.
- `src/display/graph-view/` — the drawn card: `graph-view.ts` (`GraphView`, a `Lifecycle`), its bar, zoom, selection,
  details panel and sheet, untangle, paths, View menu, mini-map, quick info and the rest; `view-options.ts` is what a
  card is given. Each module's purpose is its opening comment, and the Obsidian guide describes them by feature.
- `src/display/properties/` — the inspector's property rows, type menu (through the host) and list chips.
- `src/display/proposals/` — the proposal strip and the marks on the drawing.
- `src/display/export/` — the Export form (`export-form.ts`) and the types it and the host share (`export-types.ts`).
- `src/display/links/` — the details' links and attachments, the marks on the drawing, and the host's side of links
  (`link-types.ts`).
- `src/display/images/` — an image's first frame (`still-frame.ts`) and the host's side of images (`image-source.ts`).
- `dom-helpers.ts` — `installDomHelpers(window)`: `createDiv`, `createEl`, `setText`, `empty`, `addClass`, `activeWindow`
  and the rest, written as Obsidian's pages are, put on a plain browser window where missing. `dom-globals.d.ts` types
  them for the layer's own type check.
