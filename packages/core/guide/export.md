# Export (spec §16)

Purpose: exporting a drawing as SVG or PNG and the data as GQL, CSV or GraphML, with the plan, companion note and safe write. Part of the [core guide](../GUIDE.md).

The host does what needs a canvas, the file system or a dialog; the core decides everything else. An image is exported as
SVG or PNG (`EXPORT_FORMATS`), of the whole diagram or of a view, in the fixed light or dark colours chosen; the data as
a GQL block, CSV or GraphML (`DATA_FORMATS`), each read back into the very things and links exported.

- `export-scope.ts` — `exportScope`: what an export holds. The whole diagram is the graph as drawn. A view is put to the
  graph as `evaluate` puts it and holds only its things and the links between them, in the graph's order, each saying
  which written link it is (`edge`, so its properties are its own), with a guess (an
  estimated link) still a guess at its new place; with the faded context asked for it holds the whole graph and lists what
  is outside the view (`faded`: things by key, links by edge number). An empty graph or view is `empty`, with `why`.
- `export-marks.ts` — fading and looks written into the SVG (`marked`): an opacity in the style attribute of the group of
  each faded thing and link (the pane's 0.35), and each look's border, text, line and format as style declarations in the
  locked blend of its hue, as the pane's stylesheet draws them, because an image cannot take the stylesheet. Groups are
  found by Graphviz's numbering (`node1`, `edge1`…) in a single pass.
- `export-frame.ts` — the frame (`framed`): the image's own background, a title, the reading of a view, the legend, and a
  footer with the note and the day (`saidDate`, `11 Oct 2026`), in the locked style's font and sizes and the palette's
  fixed colours. The drawing is nested inside at natural size. Text widths are estimated, so long lines wrap early.
- `export.ts` — `exportWithLayout`: lays the scope out through the layout the host hands in (`ExportLayout`: the one its
  drawings use, apart from the interface and under the same size and time limits, so a huge or hostile graph never
  holds the page for an export), in `PALETTES.light` or `dark`, marks it, frames it, and gives `{ svg, width, height }`
  with no theme variable or `color-mix` in a colour (it throws if one is left). A layout over a limit, or timed out, is
  given back whole as its `Refusal`, for the host to say why and write nothing; null when it is no longer wanted. An
  empty scope is refused before any layout is asked for; an engine failure is raised. `exportSvg` is the same with an
  engine run on the calling thread under no limit: for tests and tools, never a host that draws apart from its interface.
  With `ExportInfo.walk` the image plays that path (path-animation.ts), refused first when too large for
  `ExportInfo.device`; with `ExportInfo.motion` it moves the links its style moves (export-motion.ts).
  `pngSize` is the PNG's pixel size, never under `PNG_MIN_SCALE` (twice natural size) and rounded up. A view's looks are
  drawn and put in the legend with what they mean.
- `export-motion.ts` — movement in an exported SVG, by CSS in the file itself (no encoder, nothing loaded): with
  `ExportInfo.motion` (an SVG; a PNG is drawn still), the links a style moves run their dashes, or a dot travels a copy
  of each one's line (`withRunners`), and `withStyleSheet` puts the style sheet first in the image; every animation stops
  under `@media (prefers-reduced-motion: reduce)`, leaving the dashes, the icons and the legend's words. Every rule is
  written under the class the image's root carries (`IMAGE_CLASS`, `inImage`), so an SVG put inline in a page styles
  nothing of the page's own.
- `export-pictures.ts` — the pictures on boxes in an exported image (§16, export_animation_stated; §18): with
  `ExportInfo.pictures`, the host's loader, each image embedded as a data address, so the file loads nothing; an SVG
  keeps an animated one moving within `IMAGE_LIMITS`, its first frame beside it shown instead under reduced motion by
  the image's own style sheet, scoped under `IMAGE_CLASS`; a PNG, or one past a limit, reduced to its first frame; one
  that cannot be had, or was never read (`UnreadImage`, over the size limit: left out), drawn as a dashed frame. Only an
  image type of a fixed list is written before the bytes, which must be base64, and an image is never put inline.
  `ExportImage.animation` says what was done with each animated image, a line
  each, and the frame says it too (`animationSaid`).
- `export-pages.ts` — `pngPages`: an image too large for one sharp PNG on the device, split into a grid of pages, each at
  twice natural size or more, within the device's pixels and no side over `PNG_MOST_SIDE` (32,767 device pixels), as
  few as the pixels allow and then evened out, so a row is never whole pages and a sliver, in reading order; null when
  the pages would be too small (`PNG_PAGE_LEAST`) or too many (`PNG_MOST_PAGES`). `pageSvg` cuts the SVG to a page by
  its root's size and view box.
- `export-data.ts` — `exportedData`: the things a scope draws and the links written between them, with every kind and
  property as read, never a schema's own thing or a guess (`ExportScope.linksAt` finds a view's links as written). A
  view holds only its own, unless its faded context is asked for: then the whole graph, with what is outside the view
  in `faded`, which each format marks. Each thing's and link's `///` note, as `notes.ts` put it on the drawing, is in
  `notes` (§24, note_standard): kept by a format with comments, left out of CSV, which has none. `dataText` writes it
  in one of `DATA_FORMATS`. No layout is asked for.
- `export-data-model.ts` — the data's types, and the five kinds of value the profile reads, each said so it reads back.
- `export-data-gql.ts` — a GQL block: the graph line, a comment saying where it came from, a thing or link to a line; a
  thing under its id, or, where its id cannot be a name, under `thing_<n>` with its id written in full. A thing or link
  of a view's faded context owns a `//@ faded: outside view <name>` line (§27), a comment to the reader; a note is
  the `///` lines directly above its thing or link.
- `export-data-csv.ts` — CSV as RFC 4180 writes it, with no byte order mark, so a spreadsheet that assumes another
  encoding without one may show non-ASCII text wrongly: a header naming each property with the kind of its values, a
  row for each thing then each link, of kind `faded thing` or `faded link` outside a view; an empty text quoted, so it is
  told from a missing one; a text a spreadsheet would run as a formula guarded by an apostrophe, which the readers take
  off but a spreadsheet such as Excel shows. CSV has no comments, so a note is left out, never made a column.
- `export-data-graphml.ts` — GraphML that keeps to its schema: a node named by its place, the thing's id, kinds and a
  link's type as data, a key for each property and kind (a day or an instant said by the key's own description,
  `gn:date` or `gn:datetime`), a view's faded context marked by `:faded`, XML's marks escaped; a character XML cannot
  hold refused, naming where it is. No GraphML schema is on this machine to validate against, and none is downloaded:
  the output was checked well-formed with xmllint, and it writes no attribute GraphML does not name. A note is an XML
  comment on the line directly before its node or edge, a comment and never a key, as GQL's engines take it.
- `xml-comment.ts` — `noteComment`: a note as the XML comment that holds it, its text escaped (`\\`, `\-` for a
  hyphen after a hyphen, `\r`, `\u{…}` for a character XML cannot hold) so it holds no `--`, never ends with `-`, can
  never end the comment, and reads back exactly. The Python library's SCXML export writes the same comment
  (`note_comment`), both held to `python/graph_spec/tests/note_comment_cases.json`; `notXml` is XML 1.0's characters.
  `commentPieces` gives the escaped text a piece for each character, keeping only the last character written, so the
  work is linear in the note (a run of hyphens among them), counted in `test/xml-comment.test.js`, never timed.
- `export-plan.ts` — `exportPlan`, the one decision before anything is written: `{ nothing }` for an empty scope,
  `{ ask }` for a note classified above the configured level (naming both; a classification not in the list counts as
  above every level; the host asks again with `confirmed` once the user says yes), or `{ go }` with the file's name and
  place and, as configured, the companion note's. A name is made from the note, the graph or view and the day, safe on
  every platform; a folder setting that could leave the vault is not used. The data gets its companion note as an image
  does; a PNG on pages gets each page's name (`pages`).
- `export-note.ts` — `companionNote`: the Markdown that links the export and the source note and names the graph or
  view, the day and the scope. An image's shows the image, or each page, with nothing of the data beyond what the image
  shows; the data's links its file, shows nothing, and says how many things and links it holds, and how many of them
  are a view's faded context.
- `export-write.ts` — `writeSafely`: the bytes go to a temporary file given by the host's `write`, then `rename` into place;
  on any failure the temporary file is `remove`d, the target is never touched, and the result says why in a sentence.
