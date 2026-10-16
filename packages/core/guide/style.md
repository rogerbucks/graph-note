# The style graph (spec §2, §6, §7), and animated images (spec §18, §11, §13)

Purpose: the style graph (nudges, looks, arrows, inline properties, moving links, pictures) and how it is read, checked and edited, then animated images and their limits. Part of the [core guide](../GUIDE.md).

A graph's nudges, the properties it shows and the styling of its views and paths are a graph of their own, written in a
style block beside it: `// graph: trip_style · STYLE trip`. `blocks.ts` knows one by its graph line (`styleOf`), and
`dataKind` never takes it for data, so `readNote` never reads or draws it and the data reads the same with or without
it. A graph line that says STYLE but names no graph is a problem, never data.

- `style-graph.ts` — what a style graph holds once read (`StyleGraph`: nudges, shows, looks, each view's fade or hide,
  how each view was shown and the View menu's switches it was saved with, the direction, where arrowheads are hidden,
  the diagram types chosen, how links move, how links are routed and merged, the pictures on boxes) and the words it
  allows: the four nudge words, the ways a link moves (`FLOW_MOTIONS`), the routings (`ROUTINGS`), the
  lines, the formats, fade or hide, on or off (`INLINE`), show or hide (`ARROWHEADS`), and the colours, which are only
  the locked style's hues by name (`STYLE_HUES`). A Show switches a property on or off inline for a kind, a thing or a
  relationship type's links, in the whole graph or one view; an Arrows hides or shows arrowheads for every link or one
  type's, in the whole graph or one view.
- `style.ts` — `readStyle`: every style block of a graph read with the data's own reader (`readBlocks`, told which blocks
  to read), so what cannot be read is a problem on its line and the rest is used; never a throw, and a style too large
  to read is not read (the locked style is kept, and why is said). `lookOf` is the look of a thing or link in a view or
  path (a named hue, a line, a format; the thing's own look over its kind's); `legendOf` every colour used there with
  what it means; `outsideOf` a view's fade or hide, fade when none is written.
- `style-reader.ts` — `reader`: one style thing's properties read as text, a number, a word it allows or a name of the
  graph it styles, each fault a problem with its fix; shared by `style-checks.ts`, `style-choice-checks.ts` and
  `link-flow.ts`.
- `style-choice-checks.ts` — the choices for how a graph or a view is drawn, each checked: an Arrows, a Diagram, and a
  Links (§25: `routing` one of `ROUTINGS`, curved, straight or right-angled; `merge` on or off; for the whole graph or
  a view). `style.ts`'s `linksOf` says how a graph's or a view's links are drawn, a view's own over the whole graph's.
- `style-checks.ts` — each style thing checked on its own: its kind, its words, its values, and every name it uses
  (thing, other, from, to, selected, kind, relationship type, path, property) against the graph it styles, a name not
  there given the nearest (`estimates.ts`'s `nearest`) as its fix. A view's name is not checked: views are query blocks,
  and a name is the user's own (`style-words.test.js` holds that, however odd the name). A thing with a key its kind does
  not know (`STYLE_KEYS`) is reported and left out; a message quotes a written word as written, `$` and all.
- `style-words.ts` — the words of a style graph checked (style_words_checked): `unknownKeys`, a problem on each key the
  kind does not know, fixed to the nearest key the thing does not already write (several equally near: each a fix; none
  near: the keys to choose from, no edit), and `readFrame`, a frame as four numbers joined by single commas (an optional
  sign, digits with a dot before or after them, an optional exponent; never hexadecimal; no space, no stray comma).
  Stray commas and spaces are a problem whose fix is the list without them, even when that is not four numbers yet; a
  part that is not a number has no edit. A thing with such a key is not also told what it lacks (`RawThing.misspelt`):
  the rename comes first, then what is still absent is said.
- `style-conflicts.ts` — the things checked against each other: two directions, beside and before on one pair, a thing
  in two groups, a loop of befores, a view set to both fade and hide or saved twice, a colour given two meanings in one
  view or path, a property switched both on and off, or arrowheads both hidden and shown, for one place in one view. The
  first written is kept, the later left out, each with a problem.
- `style-source.ts` — nudges applied after the layout source is made (`nudgedSource`: beside a `rank=same` line, before
  an invisible link after every drawn one, group a labelled cluster), and direction set on the drawing (`nudgedDrawing`).
  With no nudges the source is returned unchanged, byte-identical to the Python library's. The Python library honours
  nudges the same way (`graph_svg.nudged_source`, its style read by `gql_profile.read_style`), held to the core byte for
  byte on `python/graph_spec/tests/nudge_cases.json` by `test/layout-parity.test.js` (python_honours_nudges).
  `styledDrawing` is the drawing as its style draws it in a view or the whole graph, as every host draws a graph, a view
  or an export: its direction and nudges, the links it draws without arrowheads, the properties it shows inline, and
  how its links are routed (§25). `render.ts`'s `directions` writes in, last, what the View menu folds (`folding`, put on
  the drawing by `ViewState.folded`) and the routing.
- `arrows.ts` — arrowheads hidden or shown (§15): `arrowsShown` (the most particular choice — a view's over the whole
  graph's, then a type's over every link's — shown when none), `arrowlessLinks` (the links a drawing draws without them,
  guesses included), `linkTypes` (the type each link is styled by: a guessed type's link by the type it is taken for,
  for its arrowhead and its properties alike) and `arrowlessSource` (`dir=none` written on those links). Only the arrowhead changes, so each link
  keeps its reading when tapped and in the text version (direction_never_lost).
- `inline-properties.ts` — properties shown inline (§14): `inlineRows` (each box's and link's rows, its most particular
  Show deciding — a view's over the whole graph's, then a thing's over its kind's), `valueText` (a value said as the
  reader keeps it), and `inlineSource` (the rows below a box's text or a link's reading, at the kind caption's size, in
  the box's text colour or the link's label colour; past `INLINE_ROWS`, whole properties and how many are hidden). The
  Python library draws both the same way (`graphspec/style/arrows.py`, `inline.py`), held to the core byte for byte on
  `python/graph_spec/tests/style_cases.json` by `test/layout-parity.test.js` (arrows_both_renderers).
- `link-flow.ts` — links that move (§7): a `Flow` in the style graph, `(f1:Flow {motion: 'dashes', means: '…'})`, for
  every link or a `type`'s, in the whole graph or a `view`, moves its links as dashes running along them or a dot
  travelling along them; `still` takes a wider one back, and every link is still unless a Flow moves it
  (flow_in_style_graph). `flowOf` checks one (a Flow that moves links must say what it `means`, motion_not_alone),
  `flowFor` and `flowLinks` choose as `arrows.ts` does (the most particular, the first of two alike), and `flowSource`
  writes each moving link into the source: its label opened by its icon (`FLOW_ICONS`), the classes
  `graph-note-flow`, `-dashes` or `-dot` and `-back` (its line laid out from its far end, so it moves backwards along
  it), and dashes drawn dashed, so they show when still. `flowLegend` and `flowSaid` say each movement and its meaning in
  words, for the legend and a screen reader; `reversedLinks` says which lines run against their links. The movement
  itself is a style sheet's — the plugin's `styles.css`, or an export's (`export-motion.ts`) — and stops under reduced
  motion (motion_reduced_respected). The Python library writes the same source (`graphspec/style/flow.py`), held to the
  core byte for byte on `python/graph_spec/tests/flow_cases.json` by `test/link-flow-parity.test.js`.
- `picture.ts` — a picture on a box (§18, animated_image_shown): a `Picture` in the style graph,
  `(p1:Picture {property: 'photo', kind: 'Cat'})`, names the property holding a thing's image, for a kind's things or
  one thing, in the whole graph or a `view`; `pictureOf` checks one, `pictureFor` picks the most particular (a view's over
  the whole graph's, a thing's over its kind's, the first of two alike), `picturesFor` gives each box whose Picture's
  property holds text, and `pictureSource` keeps room for it in the source: a fixed square of `PICTURE_SIZE` points at the
  top of the box's label, filled with `PICTURE_MARK`, which a host finds and fills with the image. The Python library
  keeps the same room (`graphspec/style/picture.py`), held to the core byte for byte on
  `python/graph_spec/tests/picture_cases.json` by `test/picture-parity.test.js`.
- `style-edit.ts` — `styleEdit`: a nudge, a look, a view's fade or hide, how a view was shown, a property switched on or
  off inline, arrowheads hidden or shown, or the diagram type chosen, written as text into the graph's style block
  (made after the graph's last block when there is none); a view's setting, or a choice of properties, arrowheads or
  diagram type for one place, changed in place, never written twice; never a data block touched. A styled hue is drawn with `theme.ts`'s `hueColour`, the same blends as a
  kind's, so it meets the locked contrast.

## Animated images (spec §18, §11, §13)

A thing's image is a file attached in the vault, named by a property's value; the host reads it and draws it with its
own image decoding, and the core says what it is and what it may do. No library decodes an image here.

- `image-links.ts` — where an image comes from: `imageLink` reads a value as a link (`[[cat.gif]]`, `![[cat.gif|200]]`)
  or a path from the vault's root to a file of an image type (`IMAGE_EXTENSIONS`); an address outside the vault
  (`https:`, `data:`, `//`) is never loaded (remote images are a later slice, remote_images_asked), and a place that
  could leave the vault is refused, as a source's is (`sources.ts`, `outsideVault`), a link's target as a path's.
  `imagesOf` lists a thing's images; `neverMoves` knows a JPEG by its name, for an image too large to read.
- `image-facts.ts` — `imageFacts`: an image's format, whether it moves, its frames and its size, read from its bytes'
  header and chunks (a GIF's image descriptors, an APNG's `acTL`, an animated WebP's flag and `ANMF` chunks, an AVIF's
  `avis` brand, an SVG's animate elements or keyframes), never past the bytes there, and never looping on a length that
  does not move it on. An SVG's start and root are found by `svgScan`, which looks at each character once and counts
  what it looked at, so hostile markup (200 empty comments) costs no more than its length (review of #443). An SVG has
  no frames to count, and has a pixel size only when its root gives one in pixels: its size on disk alone holds it to
  the limits otherwise; an AVIF's size is not read either.
- `image-limits.ts` — the limits an animated image moves within (`IMAGE_LIMITS`, said in `LIMITS_SAID`: size on disk,
  pixels a frame, frames, and how many move at once in one drawing); an image over the size on disk is never read, and
  is not shown, saying why; `startOf` says how an image starts — moving; still
  under reduced motion, until played (motion_reduced_respected); its first frame, saying why, past a limit, Play refused
  (animated_image_limited); still while as many as may move already do — and `playRefusal` why Play is refused.
