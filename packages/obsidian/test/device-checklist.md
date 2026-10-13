# Device checklist — the graph note editor in Obsidian

The scripted check run by a person in Obsidian on a desktop and on a phone, for what the automated tests cannot see:
how it looks, how the gestures feel, and that it works offline on a real device. Run it on each slice's build, on the
desktop and on the phone, and note the build, the device, the date and anything that failed. An item that has passed on
one device so far carries that device's mark, and is ticked once it passes on both.

Use a note that holds the graph guide's example: a graph built in steps over several blocks, a query block, and a
schema written last. Add one link with a misspelt name, and one empty graph block.

**Numbers.** Every item has a number in its line: its section's letter, a dash and two digits, such as `V-03`, the
third item of Viewing. The letters are B Before, V Viewing, Z Zoom, P The edit pane, I Editing in place and the
inspector, S The style graph, W Views, D Parked for later, T Walked paths, X Export, C Settings, A Accessibility, F Focus
and untangle, R Proposals, G Details and the sheet, and E Diagram types.
**A number never changes once given**, whatever happens to the item's words or its place; a removed item's number is
never used again, and **a new item takes the next number in its section**. Each item after Before has a note in
`test-vault/Device checks/` that shows the case in Obsidian, found by its number (`test/device-check-notes.test.js`
holds the two together).

## Before

- [ ] **B-01** The build is installed as real files in `.obsidian/plugins/graph-note/`, and has synced to the phone.
- [ ] **B-02** Graph Note is switched on. If gql-highlight is also on, it has been reloaded since.
- [ ] **B-03** The phone is in aeroplane mode for the whole check: everything below must work offline.

## Viewing — spec §3

- [ ] **V-01** Every graph block is drawn in reading view, and in Live Preview with the cursor outside the block.
- [ ] **V-02** Each step of the example draws the graph as built so far.
- [ ] **V-03** The query block shows as coloured code with a copy button, not a drawing.
- [ ] **V-04** The empty block shows a prompt to start with a thing, and an Edit button.
- [ ] **V-05** Each drawing has a bar: problems badge, Fit, Zoom out, Zoom in, Full screen, Edit. The badge counts in words and
      shows an icon.
- [ ] **V-06** The misspelt link is drawn dashed, labelled "⚠ … (estimated)". Tapping or clicking it selects it, drawn heavier,
      and explains it in one sentence, with two buttons: the quick fix "Change … to …", which writes the name it was taken
      to mean, and Edit the link, which opens the editor with the misspelt name selected.
- [ ] **V-07** Tapping a box shows its text, its kind, and its links in and out.
- [ ] **V-08** Tapping just beside a box or a link, not on it, still chooses it. Where several are near, tapping again in the same
      place chooses the next, round to the first, and two quick taps or a double-click on or near things only choose,
      never zoom (slice 2).
- [ ] **V-09** A 50-thing graph is drawn in under half a second on the phone (§11).
- [ ] **V-10** A huge graph (over 2,000 things, made by a script) shows its text with a banner — an icon, and the limit and
      the numbers in words — and Obsidian stays responsive: the note scrolls and other blocks draw while it is checked. On
      the desktop and on the phone (§9, layout_contained; the tests run the worker in a Node thread, not a web view). The
      text has no Export button: with no drawing there is nothing to export, and an export is held to the same limits.
- [ ] **V-11** A graph whose layout runs past five seconds shows its text with the "took too long" banner and a clock icon, and
      the next graph still draws. The console says nothing about the main thread: the layout ran in a worker (§9). The text
      has no Export button either.
- [ ] **V-12** The drawing reads well in the light theme and in the dark theme. Dark, several drawings in a note, each card
      standing out: Mac ✓ 0.3.0, 9 Oct 2026 (relayed as the Mac). The light theme, and the phone, to come.

## Zoom — spec §3

- [ ] **Z-01** Desktop: the mouse wheel alone scrolls the note. With Ctrl or Command it zooms about the pointer, and so does a
      trackpad pinch, a little quicker than the fingers move.
- [ ] **Z-02** Desktop: dragging empty space pans once zoomed in. Plus, minus and zero work when the drawing has focus.
- [ ] **Z-03** Phone: one finger on a fitted drawing scrolls the note. A pinch zooms about the fingers, a little quicker than
      they move, and once zoomed in, one finger pans.
- [ ] **Z-04** Double-clicking or double-tapping empty space zooms in there; on or near a box or a link it only chooses, and
      never zooms. Fit returns to the whole drawing.
- [ ] **Z-05** Zoom stops at a quarter and at four times natural size, and text stays sharp at every level.
- [ ] **Z-06** Full screen covers the window, inside the phone's notch and home bar. Escape or Close leaves it. In full screen
      the wheel alone zooms.
- [ ] **Z-07** Double-clicking the drawing to zoom, or dragging across it, never highlights the words of its boxes and links.
      iPhone ✓ 5cfeac6, 8 Oct 2026.
- [ ] **Z-08** In a locked graph, a kind or link type its schema does not declare shows a ⚠ on its line. A link type with no
      reading of its own reads back as an arrow (Drive —HOPE→ …), not as a guess at words. iPhone ✓ 5cfeac6, 8 Oct 2026.
- [ ] **Z-09** Reading view is read-only: the bar offers Source and no Edit. Source shows the block's text, coloured, in place of
      the drawing, and pressed again brings the drawing back. A hover preview or an embed is read-only too, an embed even
      inside a note in Live Preview. Properties are shown but never added or changed: no Add property, no field, no type
      menu, no x or add field on a list. There is no Park for later, no fix that writes a suggested name, no Record a path
      or Make a view, no Fade or Hide others or Save as shown, and no Edit here or Edit in pane, even while the block is
      edited in Live Preview, and in full screen opened from reading view too. A Graph Note pane already open on the block
      keeps saving while another pane shows the note in reading view.
- [ ] **Z-10** Only one set of zoom controls appears: the Mermaid Zoom plugin does not add its own to a graph drawing.

## The edit pane — spec §4, §5, §9

- [ ] **P-01** Edit opens a pane beside the note, on the block that was tapped. A note with several graphs offers a picker.
- [ ] **P-02** The text is coloured as gql-highlight colours it, and each line is read back in plain English beside it.
- [ ] **P-03** Typing a misspelt name underlines it with a ⚠. Its fix is offered on that line, and pressing it fixes the text.
- [ ] **P-04** Names, kinds and relationships already in the graph are suggested while typing. On the desktop, Tab takes the first.
- [ ] **P-05** What is typed reaches the note within about a third of a second, and the drawing follows. Renaming or moving the
      note while typing changes nothing: what is typed next still reaches it. Deleting the note while typing keeps what
      was typed as a draft, and the pane says so; the command Recover kept drafts into a new note writes it into a note.
- [ ] **P-06** Editing the same block in the note while typing in the pane: the pane reloads the block, says what was typed is
      kept as a draft, and Restore draft brings it back.
- [ ] **P-07** Undo and Redo take back and put back each change in the note.
- [ ] **P-08** Typing ( to start the next pattern on a new line adds the comma to the line before; typing ] after a link type
      written without its colon, such as -[favours, adds the colon and the type as the graph spells it, [:FAVOURS]. One
      undo takes either back. Both work in the pane, in place and in the note itself.
- [ ] **P-09** In the note itself, with Obsidian's "Auto pair brackets" on (Settings → Editor), and again with it off: the comma
      comes when ( is typed, and the colon when ] is typed or stepped over.
- [ ] **P-10** Completing as you type, in the pane and in the card: typing { shows a faint } after the caret, and the text after
      it does not move. Tab writes it with the caret left inside; Escape puts it away until the next typing; one undo
      takes back what Tab wrote. Typing the closer yourself where one is already there steps over it (and a stepped-over
      ] still gets its colon), and one undo goes back to the text as it was on screen. Likewise a keyword (MA), a kind
      after (z:, a type after -[:, a property name after {, and a value already used after name: '; these Enter takes
      too, but Enter never takes a closer, and with nothing to take it is a new line. After a bare ( the names are
      suggested and Tab takes the first, as before. On the phone, Enter on the keyboard takes a word (there is no Tab);
      confirm that the Enter ending an IME composition (e.g. Japanese keyboard) takes nothing.
- [ ] **P-11** A thing given text but no name, such as `(:Option {name: 'Large reader'})`, is drawn, and shows a ⚠ naming the
      suggested name, in the style of the names already in the graph and not one of them. Its fix puts the name after the
      (, and the ⚠ goes. A thing given a name but no text, such as `(large_reader:Option)`, shows an ℹ hint, not counted
      on the badge, with the text suggested from the name; its fix adds `{name: 'Large reader'}`. Nothing is written
      until the fix is pressed.
- [ ] **P-12** A graph locked by an earlier build shows a ⚠ that its schema does not declare its types; its fix adds the
      DECLARES links, and the ⚠ goes.
- [ ] **P-13** A link type left without its colon is drawn as that type, with a ⚠ whose fix writes the colon. A new type written
      without its colon is an error that says to write it.
- [ ] **P-14** A draft graph offers Lock the graph. Locking writes its schema as a new block after the graph.
- [ ] **P-15** Lock a graph built over two blocks, from its first block: the schema declares every kind and relationship of
      both blocks, and the graph then shows no problems.
- [ ] **P-16** Phone: the pane offers Drawing and Text as two tabs, with problems in a sheet at the bottom. Every button is easy
      to hit with a thumb, and nothing needs a hover.

## Editing in place and the inspector — spec §4, §14

- [ ] **I-01** Edit here opens the text inside the drawing's card, and typing there redraws the drawing without losing the place.
- [ ] **I-02** Straight after the app starts or reloads, and on a card far down a long note scrolled to only then: Edit here
      opens the editor in that card, and Done closes it with what was typed in the note. Edit here never does nothing
      without saying why. Pressed twice quickly, it opens one editor, with the focus in it, never two.
- [ ] **I-03** In the card, the text box is as tall as the text and one more line: no empty area below it for the caret to land
      in. Each read-back sits on its own line's right, never wrapping under it, and typing lands where the text shows.
      iPhone ✓ 5cfeac6, 8 Oct 2026.
- [x] **I-04** Live Preview: typing in a card, with the card's top above the view or the note scrolled to its end, never moves
      the page: the box stays where it is on screen, and the note's other text with it. Mac ✓ 0.3.0, iPhone ✓ 0.3.0, 9 Oct 2026.
- [ ] **I-05** Typing in the card, character by character, redraws the drawing and never takes the focus from the box: the caret,
      the selection and where it is scrolled stay put. Typing a comma at a line's end keeps the box in its card.
      Undo (⌘Z, or Edit → Undo, or the phone's undo gesture) takes back a run of typing at a time, even after redraws.
      A line added above the block, or taken away, while the card is edited keeps the box in its card, with its selection
      and its undo history. Mac ✓ 3d34e0d, reading view, 9 Oct 2026 (traced in the app); Live Preview and the phone to come.
- [x] **I-06** Desktop: hovering the mouse over the box in the card, and clicking into it, never turns it grey or hides its
      coloured text, and no tooltip appears over it. Mac ✓ d601110, 8 Oct 2026.
- [ ] **I-07** While the card is being edited, its pencil shows as a book (view) icon. Pressing it writes what was typed and
      closes the box, as Done does, and the pencil comes back. Mac ✓ d601110, 8 Oct 2026.
- [x] **I-08** In edit mode, tapping a box or a link shows its properties, looking as a note's Properties panel looks in this
      theme: the same rows, icons, spacing, type and colours, in both the light and dark themes.
      Mac ✓ 0.3.0, iPhone ✓ 0.3.0, 9 Oct 2026.
- [ ] **I-09** A number has a number field, a date opens the date picker, and true or false is a checkbox.
- [ ] **I-10** A value is written when its field is left; a value that does not fit its type says why, and nothing changes.
- [ ] **I-11** Tapping a property's icon opens a menu to change its type or remove it. Add property adds a row in place, its
      name suggested from the names already used.
- [ ] **I-12** A text property with several values (`tags: 'quiet, cheap'`): the icon's menu lists List after Text. Choosing it
      shows two fields, a kind and a relationship, filled in from the property's name and offering the kinds and
      relationships the graph already uses; Make list turns each value into a thing of that kind, linked from this one,
      and the property row becomes a row of chips. Cancel puts the field back. Undo (⌘Z, or the phone's gesture) takes
      the whole change back in one step. A thing with the same name that already exists is linked, not written again.
- [ ] **I-13** A list's chips look as a note's list property looks in the Properties panel in this theme, light and dark. The x
      on a chip removes it: the link goes, and the thing too when nothing else links to it, and a line under the rows
      says which. The add field adds a value on Enter, or when it is left; an empty value, or one already there, says
      why and writes nothing. Phone: the chips, their x and the add field are easy to hit in the sheet, and the keyboard
      does not cover the field being typed in.
- [ ] **I-14** Tap a box so its properties show, then press Done (or the book icon). The properties stay open but read-only, as a
      tap shows them outside edit mode: no fields, no Add property, no x on a chip and no add box. Pressing Edit here
      again, and tapping the box, brings the editable properties back. Details closed before Done stay closed.
- [ ] **I-15** Add a property named `rivals` and choose List. The form says, in one sentence, that the values become things
      linked by the relationship and that the row is named after it. After Make list the row reads `rivals · HAS_RIVAL`
      for as long as the editor stays open, and `HAS_RIVAL` alone after Done and a reload. A value typed in as
      `Reading tablet` is written as `reading_tablet` when the graph's names are snake case, with the words kept as its name.
- [ ] **I-16** Phone and desktop: with the properties lower down the screen, so the icon is near the bottom of the window, the
      property type menu opens above the icon and shows every item down to Remove, Checkbox included; with room below
      it opens under the icon as before. On the phone, where the rows are taller, it also fits.
- [ ] **I-17** While editing, in the card or the pane, choosing a box selects the pattern that writes it in the text, and
      choosing a link selects its brackets and arrow (slice 2).
- [ ] **I-18** Phone: the properties open as a sheet at the bottom of the screen, and every field and icon is easy to hit.
- [ ] **I-19** A thing written without a name (`(:Option {name: 'Small reader'})`), desktop and phone, light and dark: its box is
      drawn under the suggested name, with a dashed outline and "✎ SUGGESTED NAME" under its text, readable and not
      shown by colour alone. Tapping it opens its details like any box's: "✎ Suggested name: small_reader — not written
      yet". Outside edit mode nothing can be written there; the note is unchanged. While editing, tapping it selects
      `(:Option {name: 'Small reader'})` in the text, and the details offer "Add the name small_reader". Pressing it
      writes the name after the `(`, the box is redrawn solid and unlabelled, and the warning leaves the problems list.
      One undo (⌘Z, or the phone's gesture) takes the name back out, and the dashed box and the warning return. While
      the name is not written, nothing else writes it: Park it, Save path (a path through it), Write the view (a view
      picking it), a property changed or made a list, and Save as shown with it selected are each refused with a message
      beginning "accept its name first", and the note is unchanged. Phone: the button is easy to hit in the sheet
      (slice 2, unnamed_drawn_suggested).
- [ ] **I-20** Edit here on a card, press Add a thing: it asks for the thing's text first, with the focus in it. Type some
      (such as "Small reader"): the name suggested from it appears, in the style of the names already in the graph and not
      one of them, small_reader, and the text of the block is unchanged. Give the kind Option and press Add the thing:
      `(small_reader:Option {name: 'Small reader'})` is written after the block's last item, the name shown is the name
      written, and one undo takes it back out. A name typed in its own field is kept as the text changes. No text, a name
      the graph has, more than one word, a word the language keeps, or a kind the graph keeps for its schema is refused
      in words and nothing is written. Enter in a field adds the thing and Escape cancels.
      Desktop and phone: every field and button is easy to hit (slice 2, add_thing).

## The style graph — spec §2, §6

- [ ] **S-01** A note with a graph and its style block (`// graph: reader_style · STYLE reader`, with a direction nudge TB and
      a beside nudge): the style block shows as one folded line, "Style of graph reader: 2 nudges", opening to its
      text; the graph runs top to bottom with the two things side by side (slice 2, style_block_in_note,
      style_is_a_graph).
- [ ] **S-02** Change a nudge's word to `besides`: the fold says "⚠ 1 problem"; the graph's badge lists "a nudge must be one of
      four words…" and the graph is still drawn (four_nudge_words, nudge_problems). Break the block's text: the graph
      is drawn in the locked style and the problem listed (broken_style_block).

## Views — spec §2, §7

- [ ] **W-01** A view block (`// graph: trip · QUERY view round_park` with `MATCH (n {id: 'park'})-[]-{1,1}(m) RETURN n, m`):
      its card says "View round_park: everything within 1 step of The park"; the things outside it are faded. Hide
      others writes `outside: 'hide'` into the style block and the card redraws with only the view (slice 2,
      views_in_the_note, view_is_query, fade_or_hide_in_style).
- [ ] **W-02** Each of the five kinds draws: picked by hand, near a thing, how one reaches another, only some kinds
      (`MATCH (n IS Place|Person) RETURN n`), a walked path (five_view_kinds). A query of another shape is refused, the
      card naming the five shapes (view_profile). A view of a thing not in the graph says it matches nothing, with
      Change the view, which opens the note at the view (empty_view).
- [ ] **W-03** A Look with a colour and its meaning: the thing is drawn in that hue, readable in light and dark, and the legend
      shows the swatch and the words (styled_paths_and_views, styling_keeps_locked_rules).
- [ ] **W-04** Edit here, Make a view: tap two boxes; the strip says "The view: A and B, picked by hand." Switch to Near a thing,
      tap one, choose 2 steps; then How one reaches another, tap two; then Only some kinds, tap one. Name it and Write
      the view: a view block appears after the graph, and draws (slice 2, views_by_tapping). Phone: every control easy to hit.
- [ ] **W-05** Zoom in, select a box, Save as shown: the style block gets a Shown; close and reopen the note: the view opens at
      that zoom with that box's details open (view_saved_as_shown).

## Parked for later — spec §5, §8

- [ ] **D-01** Edit here on a card, tap a box, press Park for later, fill what is needed and why, press Park it: a Deferred is
      written into the block; when the card redraws, the box is dashed with "⏳ later" at its top right, readable in light
      and dark, and the badge says "No problems, 1 parked". On a box drawn under a suggested name (I-19), Park it is refused
      with "accept its name first", and nothing is written (slice 2, park_for_later, deferred_drawn, parked_not_broken).
- [ ] **D-02** Change its revisit_by to a day in the past: the mark says "⏳ overdue", the badge adds "1 overdue", and the list
      behind the badge names it with what is needed. VoiceOver reads the box as "parked for later, overdue".
- [ ] **D-03** In a locked graph whose schema does not declare Deferred and DEFERS, Edit here, tap a box, press Park for later,
      fill the form and press Park it: the message says to declare them, and a button "Declare Deferred and DEFERS in
      the schema" appears below it, as big as the other buttons to touch and read by VoiceOver. Press it: the two
      declarations are written at the end of the block that holds the schema (in the text being edited, or, when the
      schema is in a later block, in that block of the note), the Deferred is written with what you typed in the form,
      and the badge says "No problems, 1 parked" (park_for_later). Pressing the button twice fast parks once. Blank
      What is needed first and press it: nothing is declared, and the message says what is missing. Undo takes back the
      park, and, when the schema is in the same block, the declarations with it; when the schema is in another block
      the declarations are not undone with the park, and stay until removed by hand.

## Walked paths — spec §7

- [ ] **T-01** Edit here, press Record a path, tap three boxes: each shows its number at its top left as it is tapped (a box
      tapped twice shows both). Undo step takes the last back. Give a title and Save path: a Path with STEP 1 to 3 is
      written; the card redraws. A path through a box drawn under a suggested name (I-19) is refused with "accept its name
      first", and nothing is written (slice 2, record_and_play, walked_path_is_data, steps_numbered).
- [ ] **T-02** Press Play <title>: "Step 1 of 3: …" is shown and read by VoiceOver, the box outlined heavier; Next and Previous
      move one step, and stop at the ends; Stop playing clears it. Desktop and phone, light and dark.
- [ ] **T-03** Rename one stepped thing: the problem names the step and offers Remove the step; pressing it renumbers the later
      steps (slice 2, path_missing_step). A Path with no STEP shows "the path … has no steps" and no Play (path_no_steps).

## Export — spec §16

- [ ] **X-01** Mac: Export on a card, The whole diagram, SVG, Light, Export it: a file `<note>-<graph>-<day>.svg` appears next to
      the note; opened outside Obsidian (Finder's Quick Look) it reads the same, with the graph's name, its legend,
      and "From <note>, exported <day>" (slice 2, export_two_scopes, export_formats, export_self_explaining,
      export_fixed_theme). Dark: the same in dark colours. The console says nothing about the main thread: the export was laid
      out in the worker, as a drawing is (§9, layout_contained).
- [ ] **X-02** PNG: the file opens sharp at twice the drawing's size or more (export_png_sharp).
- [ ] **X-03** On a view's card: the view alone, then with the rest faded (view_export_stays_view).
- [ ] **X-04** Settings › Export › companion note on: a `.md` beside the image shows it and links the note
      (export_companion_note). A note with `classification:` above the setting's level: the form names it and writes
      nothing until Export anyway (classified_export).
- [ ] **X-05** iPhone: Export it, then Share: the share sheet opens with the image, PNG and SVG both (slice 2, export_share_sheet).
      Close the sheet without sharing: "Not shared", and nothing is saved in the vault.
- [ ] **X-06** Android, if one is to hand: a phone that cannot share a file saves the export in the vault and says so.
- [ ] **X-07** Export the same graph twice on one day: the second is saved as `…-2.svg`, the first kept, and the notice says so.

## Settings — spec §21

- [ ] **C-01** Settings › Graph Note, desktop and phone: one page, with Strictness, AI models, Formatting and Drawing, each
      option with a sentence saying what it does. Searching the settings for "strictness" finds it (slice 2,
      settings_page).
- [ ] **C-02** Strictness Standard: a block missing a comma at a line's end shows it as an error (✖) behind the badge, and is
      still drawn. Forgiving (the default): a warning (⚠). Simplified with "A missing comma" on: no problem at all
      (slice 2, strictness_levels).
- [ ] **C-03** With such a note in front, "Convert this note to standard GQL" from the command palette, and the button on the
      page: the comma is written, a notice says how many were converted, and one undo takes it back (slice 2,
      simplified_back_to_standard).
- [ ] **C-04** AI models: Add a model, open Model 1, fill its name and purpose, pick a ceiling, and choose a key with the app's
      own key field. Close and reopen the page: all kept. The plugin's data.json in the vault holds the key's name, never
      the key (slice 2, settings_ai_models).
- [ ] **C-05** Indent "Two spaces", then Lock the graph on a draft: the schema's later lines start with two spaces. Direction
      "Top to bottom": every drawing runs top to bottom; "Best fit" restores the old choice (slice 2,
      settings_formatting).
- [ ] **C-06** A note with a line that cannot be read, in front, and "Convert this note to standard GQL" from the command
      palette: the note is left as it is, and the notice says why (slice 2, simplified_back_to_standard).
- [ ] **C-07** With the pane in front showing a note in reading view, "Convert this note to standard GQL" from the command
      palette, and the button on the page: the note is left as it is, and the notice says why. With no note in the pane in
      front (the Graph Note pane, a canvas, a PDF, an empty tab), nothing is converted, and the notice says the pane holds
      no note. The pane in front decides: in Live Preview it converts, even while another pane shows the note in reading
      view.

## Accessibility — spec §8, §11

- [ ] **A-01** Desktop, keyboard only: Tab reaches every button, the drawing, each box and each estimated link. Enter opens a
      box's details or an estimate's reason.
- [ ] **A-02** With VoiceOver: the drawing is described as a list of sentences, and a new problem typed in the pane is announced
      without the focus moving.

## Focus and untangle — spec §25

- [ ] **F-01** Tap a box: it, its links and the boxes at their other ends stay filled, with the heavier outline; every other box
      becomes an empty outline and its words stay as easy to read; nothing moves or disappears. Tap empty space, or press
      Escape: everything is back as it was. Desktop and phone, light and dark (slice 3, focus_neighbours, focus_readable,
      focus_cleared).
- [ ] **F-02** Tap a link: it and the two boxes it joins stay at full strength and the rest fade. Settings › Graph Note › Focus
      reaches › Two steps: tap a box and the boxes two links away stay at full strength too (slice 3, focus_link,
      focus_depth).
- [ ] **F-03** Mac, pointer: point at a box and it gets a glow round its outline and its words are underlined; point at a link and
      the link and its two boxes do; point at a faded box while one thing is selected and it comes forward until the pointer
      leaves. Nothing in the drawing shifts or changes size (slice 3, hover_highlight, hover_still).
- [ ] **F-04** Without a pointer: on the phone, a tap that selects a box gives it the same glow and underline, and they stay until
      something else is chosen; on a keyboard, Tab to a box or a link gives them too (slice 3, hover_not_alone).
- [ ] **F-05** Open a box's details and press Show only this and its neighbours: the other boxes and their links disappear, and a
      banner names the box and the steps. Widen to two steps and Narrow to one step change it; Show the whole graph brings
      everything back (slice 3, untangle_neighbourhood).
- [ ] **F-06** Press Filter by kind or link: each kind and relationship type is a button with its count. Choose one: it comes
      forward, the rest fade, and the button says "in front". Choose it again: it is hidden, struck through, and says
      "hidden". Once more: it is back (slice 3, untangle_legend).
- [ ] **F-07** Open a box's details and press Shortest path to another thing, then tap a second box: the path stays at full strength
      and the banner reads out the boxes along it. With a box that has no route to it, the banner says there is none. Clear
      the path puts the focus back (slice 3, untangle_path).
- [ ] **F-08** Zoom in far, press Find a thing and type part of a name or of a property's value: the matches are listed with
      their kind. Choose one: its details open and it is brought into view. Escape closes the search and returns to its
      button (slice 3, untangle_find).
- [ ] **F-09** Select a box, then press the arrow keys: the selection moves along a link to the neighbouring box in that
      direction, and every neighbour can be reached by some arrow. Nothing in the note changes in any of this (slice 3,
      untangle_keyboard, untangle_data_untouched).

## Proposals — spec §17

- [ ] **R-01** Phone: a change set proposed against a graph (`// graph: reader · CHANGE SET …`), in Live Preview. The changes are
      listed in a sheet at the bottom of the screen, one to a row, each in plain English with its own Accept and Reject,
      and every button is easy to hit with a thumb. The drawing above marks what is added, changed and removed, in words
      as well as in its outlines. Accept one change: only it is written into the graph, and its row says it was accepted.
      Reject another: the graph block is the same, and the change set records it. Undo takes the last decision back. A
      graph changed since the proposal was made shows a notice first, and Accept stays off until the notice is marked
      read (slice 3, proposals_phone, proposal_provenance, person_decides).

## Details and the sheet — spec §25

- [ ] **G-01** Tap a box with several links of one type: its details list them by type and way, in words, each group once
      with a count where there are several, such as "is answered by Kindle and Tablet (2)". Each name is underlined; tap
      one and it becomes the selection, its details open and the drawing glides to it at the same zoom. Zoomed far out,
      it is brought up to a size that can be read (slice 3, details_links_listed, details_choose_moves).
- [ ] **G-02** Settings › Accessibility › Reduce motion on the Mac, or Reduce Motion on the iPhone: choosing a linked thing
      jumps straight to it, with no glide. With it off, the glide is brief, and the box is marked selected and named in
      the details as the glide starts (slice 3, details_move_motion).
- [ ] **G-03** Choose three things in turn from the details, then press Back twice and Forward once: each step returns to
      the thing it names, and tapping a box in the drawing starts the trail again (slice 3, details_trail).
- [ ] **G-04** Select a box, then zoom in until it is out of sight: a round arrow at the edge of the drawing points to it.
      Tap the arrow: the box comes back into view and the arrow goes (slice 3, selection_pointer).
- [ ] **G-05** iPhone, reading view and Live Preview, a card taller than the screen: tap a box near the foot of the screen.
      The details open as a sheet at the foot of the screen, over the card and as wide as it, and the drawing moves up
      so the box sits above the sheet. Scroll the note: the sheet stays where it is; scroll the card off the screen: the
      sheet goes, and comes back with the card. Same on the Mac (slice 3, details_on_screen, sheet_pinned,
      sheet_keeps_thing_clear).
- [ ] **G-06** Press the arrow in the sheet's header: it shrinks to a bar with the box's name and kind, and the drawing
      settles; press it again and the full details return, scrolling inside the sheet, which never covers more than
      about half the screen. Minimise it, close it and tap another box, in this card or another: it opens minimised
      (slice 3, sheet_min_max, sheet_state_remembered).
- [ ] **G-07** Close the sheet with its x, with Escape, and by tapping empty space in the drawing: each closes it and clears
      the selection. In Live Preview, with the sheet open, click into the note's text and type, Escape and the arrow
      keys included: every key reaches the note. With VoiceOver, the arrow and the x are read as "Minimise details" and
      "Close details", and Tab reaches both (slice 3, sheet_closed, sheet_reachable).

## Diagram types — spec §15

- [ ] **E-01** Diagram type on a card lists Network, Tree, Flow, Radial, Lanes, Timeline and Table: each that fits can be
      pressed, each that does not is greyed with why beside it, and one says "suggested". The card says "Drawn as a
      network" until a type is pressed. Press Tree: a Diagram is written into the style block, never the data, and the
      card redraws top to bottom (slice 3, diagram_type_set, type_only_when_fits, suggest_type, type_remembered).
- [ ] **E-02** Press each type in turn, in light and dark: every box keeps its kind's colour and every link its reading's,
      the words are the same sizes, and all read as clearly as in the network; a table's rows read the same way
      (type_one_look).
- [ ] **E-03** In each type, the table among them: tap a box or a row for its details; Edit here, then change a property in
      the inspector; zoom in and out with the buttons and a pinch, Fit, and Full screen. Each works as in the network
      (type_one_way_to_work).
- [ ] **E-04** On the tree, give a thing a second parent: the card says the graph no longer fits a tree and why, draws it as a
      network, and offers Use flow; press it, and the style block now says flow (type_stops_fitting).
- [ ] **E-05** Phone: a wide flow, a wide tree and a wide timeline each show at a readable size, fitted top to bottom; a finger
      moves the drawing sideways only, and up and down still scroll the note (wide_types_phone).
- [ ] **E-06** A graph of 51 things says it has too many to read in one drawing and offers Show as table and a view; Show as
      table draws it as a table (large_way_in).

## Result

Build: ____ · Device: ____ · Obsidian version: ____ · Date: ____ · By: ____

Failures, each with what was seen:
