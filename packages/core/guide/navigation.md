# Finding your way round a large graph (spec §25)

Purpose: focus, untangling, folding, the View menu's switches and the details' navigation. Part of the [core guide](../GUIDE.md).

Pure and host-free: each says only what to keep at full strength, hide or bring forward, so a host changes the drawing
and nothing else (untangle_data_untouched). Nothing here is written to a note or saved, but the legend's choices, which
a host writes into the style graph when the user saves a view as shown (untangle-saved.ts).

- `focus.ts` — focus on a selection: `focusOf` keeps a thing, its links and the things at their other ends (to two steps
  by the setting), or a link and the two things it joins; `highlightOf` is what the pointer, keyboard focus or a touch's
  tap marks; `FocusState` is the selection, cleared by an empty tap or Escape; `edgesOf` numbers the drawing's links as
  its SVG does (written ones, then the estimates of a name), `estimateEdge` finds one. `FADE` and `KEPT` are how a faded
  and a kept thing are drawn, by strength and outline, never by colour; `focus.test.js` holds `FADE.text` to 4.5:1 in
  both themes, and the host's `styles.css` to these numbers.
- `untangle.ts` — `neighbourhood` (a thing and what is within one or two steps, filtered to), `kindLegend` and
  `LegendFilter` (choosing a kind or relationship type brings it forward, again hides it, once more puts it back),
  `shortestPath` and `pathWords` (fewest links, either way; or that there is none), `find` (by name or property),
  `nextAlong` (an arrow key walks to the neighbour in that direction), `emphasis` (a path over the selection over the
  legend), and `Untangle`, which holds all of it for one drawing and works it out into `layers`: what is kept and what is
  hidden. `LegendFilter.choices` gives the legend's lines brought forward or hidden, kinds first, each by name, and
  `restore` puts them back; an `Untangle` made for a view saved with them starts with them.
- `untangle-saved.ts` — the legend's choices saved with a view (untangle_legend, view_saved_as_shown): written by
  `styleEdit` as a Shown's `legend` ('kind:Person forward, type:NEAR hidden', `legendText`) only when the user saves the
  view as shown, never otherwise, a choice that is no legend's refused first (`legendRefusal`); read and checked by
  `legendChecked` (an empty entry, one that cannot be read, a state not allowed, a kind or type the graph lacks with the
  nearest, a line chosen twice: each a problem on the Shown's line with its fix, the rest kept). The Python library
  reads it the same (`graphspec/style/legend.py`), held to `python/graph_spec/tests/legend_cases.json` by
  `test/untangle-saved-parity.test.js`.
- `untangle-fold.ts` — folding (untangle_hubs, untangle_groups, untangle_merge): `BUSY_HUB` (a thing with more links is
  a busy hub), `busyHubs`, `drawnGroups` (the groups the nudges draw, as `nudgedSource` boxes them; none in lanes),
  `foldPlan` (what a drawing folds and merges: things hidden with a hub, links folded into a stub or inside a folded
  group, each hub's count, every group and whether it is folded, and whether links between groups merge), and
  `foldsHiding` (the folds a found thing is hidden in). Plain lists, so the plan crosses to the layout worker.
- `fold-source.ts` — the plan written into the layout source last (`foldedSource`): a stub with its count for each hub,
  a box with its count for each folded group, two or more links from one group to another drawn through one trunk, each
  link still its own two lines (`edge7_tail`, `edge7`), and every box and link still drawn given the id Graphviz gave it
  unfolded, so the host finds each by its number as before; and `routedSource`, links straight (`splines=line`) or
  right-angled (`splines=ortho`, readings as `xlabel`). Nothing to fold or route: the source unchanged. The Python
  library writes the same (`graphspec/style/folding.py`, `fold_source.py`), held to it byte for byte on
  `python/graph_spec/tests/fold_cases.json` by `test/layout-parity.test.js`.
- `view-switches.ts` — the View menu's four switches (view_switches): `VIEW_SWITCHES`, `SWITCH_NAMES`,
  `startingSwitches` (from the settings' defaults, the style graph's merging and a view's switches saved as shown,
  view_switch_defaults), `labelsHidden` and `LABEL_SCALE` (a link's label under 11 pixels is hidden, untangle_labels),
  and `ViewState`, one card's switches and the folds opened since, which folds a styled drawing for its layout
  (`folded`), offers a hub's fold from its details (`hub`) and gives the switches a view saves (`saved`); the drawing's
  alone, never written to the note (view_switch_view_only).
- `details-nav.ts` — finding your way from a thing's details: `linkGroups` (its links by relationship type and direction,
  in words with a count: "is reported to by Bob and Cy (2)", the reverse reading the schema's or the library's guess, a
  thing linked twice the same way named once with each of its links),
  `Trail` (the things chosen from them, back and forward), `glideAt` and `MOVE_MS` (the brief eased move to a chosen
  thing), `READABLE_SCALE` (below it a thing's words are under 11 pixels, too small to read), `pointerTo` (the arrow at
  the view's edge pointing to a selection out of sight), and `sheetLimit` and `coverOf` (how tall the details sheet may
  be, and how much of a viewport it covers).
