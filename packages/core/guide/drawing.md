# Drawing

Purpose: the modules that lay a reading out with Graphviz, set its colours and size, find what a tap lands on, and zoom it. Part of the [core guide](../GUIDE.md).

- `layout.ts` — the Graphviz layout source, byte-identical to the Python library's, a box drawn under a suggested name
  dashed and labelled so in both.
- `engine.ts` — starting the bundled Graphviz engine, WebAssembly: the one module that imports it, and only the entry
  imports this one, so the rest of the core runs in a host with no WebAssembly, such as a Claude Code mod.
- `render.ts` — laying out with the engine it is handed, or around one run elsewhere (`directions`, then `chosen` with
  the SVGs it drew), and what a box's or link's details are.
- `layout-limits.ts` — how large a graph may be before it is shown as text (spec §9, layout_contained), each limit with
  its reason: the note's text, measured before it is read (`READ_LIMITS`, `textTooLarge`, which `readNote` applies to the
  graph blocks and shared schemas, never to a query or an excerpt); the things, links, longest word and drawing
  instructions, before any layout (`LAYOUT_LIMITS`, `tooLarge`); and the tighter ones on the page's own thread
  (`PAGE_LIMITS`). `READ_LIMITS` are the plugin's alone, a known exception to drawing as the Python reader does
  (drawn_in_part): over them the plugin reads and draws nothing, so there is nothing to compare.
- `layout-worker.ts` — the layout kept apart from the interface: both sides of the talk with a worker, through a port the
  host gives it — the worker's (`serveLayouts`: its engine started at once, and "ready" said) and the page's
  (`LayoutRunner`: one worker reused; each layout timed from "ready"; a fresh worker after one overruns, none after three
  in a row; the page's thread only when the first worker cannot start, where every layout already queued is held again to
  the page's lower limits; a layout superseded before it starts dropped). A layout may ask for a fixed theme (`light` or
  `dark`), which the worker themes it in: that is how an export is laid out, in the same worker and under the same limits.
- `theme.ts` — the drawing's colours and size, from the theme, in the host's palette; `hueColour` is the one blend every
  hue is drawn through, kinds, readings and the style graph's looks alike.
- `palette.ts` — the one colour mapping (spec §10): how each host writes the style's colours. Obsidian's entry names
  its theme variables; the fixed light and dark entries, for a host that draws the SVG as an isolated image (a Claude
  Code pane), are worked out to hex and paint their own page, with the locked contrast held; the system entry carries
  both in the drawing's own style sheet, `prefers-color-scheme` choosing, for a host that cannot say which it shows.
- `hits.ts` — what a tap lands on or near, and where a box is (`boundsOf`, as fractions of the drawing; `centres`); a
  link merged into a trunk (§25) by either of its lines.
- `zoom.ts` — zoom, pan and full screen, and `resize` for a new viewport or a drawing laid out again (§25); `reveal` brings a box into view, centred, and leaves one already in view alone;
  `aim` says where the view would go to do so, keeping the zoom unless it is below a scale given (§25); `keepClear` keeps
  a strip at the viewport's foot clear, as a sheet covers it, letting the drawing pan up into it by as much and no more.
- `zoom-fit.ts` — the limits `Zoom` holds a drawing within: `MAX_SCALE` and `STEP`, the scale that fits the whole
  drawing (`wholeFit`, and `fitScale`, never above natural size in a note), the furthest out (`outLimit`: the whole
  drawing's fit, or natural size when it fits larger, in place of §3's quarter, zoom_out_to_fit; `Zoom.outLimit` says
  it), and where it may sit in its viewport (`clampPan`), each worked out from the sizes given whenever it is asked, so
  a resized view, full screen or a drawing laid out again has its own (zoom_fit_recomputed); `resize` brings a drawing
  shown below the new fit up to it. A viewport with no size (`hasSize`), as a hidden card or one not yet laid out has,
  has no fit yet (`outLimit` 0, `held` keeps any scale above 0), and a resize to it is no resize: only the drawing's new
  size is taken, so a hidden card keeps its zoom and a zoom restored before layout is kept; one fitted when hidden is
  fitted again, to the size it was laid out at meanwhile, at the next resize with a size.
- `zoom-across.ts` — `AcrossZoom`, a `Zoom` that only adds to it: a wide drawing fitted to its height, shown from its
  start and moved across only by one finger, until it is zoomed in; a pinch as any drawing's (a tree, flow or timeline
  on a phone, §15 wide_types_phone).
