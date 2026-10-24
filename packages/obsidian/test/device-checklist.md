# Device checklist — the graph note editor in Obsidian

This is the scripted check a person runs in Obsidian, on a desktop and on a phone. It covers what the automated tests
cannot see: how it looks, how the gestures feel, and that it works offline on a real device.

Run it on each slice's build, on the desktop and on the phone. Note the build, the device, the date and anything that
failed. An item that has passed on one device so far carries that device's mark. It is ticked once it passes on both.

Use a note that holds the graph guide's example: a graph built in steps over several blocks, a query block, and a
schema written last. Add one link with a misspelt name, and one empty graph block.

**Numbers.** Every item has a number in its line: its section's letter, a dash and two digits, such as `V-03`, the
third item of Viewing. The letters are:

- B Before
- V Viewing
- Z Zoom
- P The edit pane
- I Editing in place and the inspector
- S The style graph
- W Views
- D Parked for later
- T Walked paths
- X Export
- C Settings
- A Accessibility
- F Focus and untangle
- R Proposals
- G Details and the sheet
- E Diagram types
- U AI models
- Q Sources and steps
- L Link flow and path play
- M The View menu
- K Animated images
- H Links and attachments

**A number never changes once given**, whatever happens to the item's words or its place. A removed item's number is
never used again, and **a new item takes the next number in its section**.

Each item after Before has a note in `test-vault/Device checks/` that shows the case in Obsidian, found by its number.
`test/device-check-notes.test.js` holds the two together.

## Before

- [ ] **B-01** The build is installed as real files in `.obsidian/plugins/thoughtknot/`, and the test images are made.
      `node scripts/reset-test-vault.mjs` does both, big.gif among the images. Both have synced to the phone.
- [ ] **B-02** ThoughtKnot is switched on. If gql-highlight is also on, it has been reloaded since.
- [ ] **B-03** The phone is in aeroplane mode for the whole check: everything below must work offline.

## Viewing — spec §3

- [ ] **V-01** Every graph block is drawn in reading view, and in Live Preview with the cursor outside the block.
- [ ] **V-02** Each step of the example draws the graph as built so far.
- [ ] **V-03** The query block shows as coloured code with a copy button, not a drawing.
- [ ] **V-04** The empty block shows a prompt to start with a thing, and an Edit button.
- [ ] **V-05** Each drawing has a bar: problems badge, Fit, Zoom out, Zoom in, Full screen, Edit. The badge counts in words and
      shows an icon.
- [ ] **V-06** The misspelt link is drawn dashed, labelled "⚠ … (estimated)". Tapping or clicking it selects it and
      draws it heavier. It is explained in one sentence, with two buttons. The quick fix "Change … to …" writes the name
      it was taken to mean. Edit the link opens the editor with the misspelt name selected.
- [ ] **V-07** Tapping a box shows its text, its kind, and its links in and out.
- [ ] **V-08** Tapping just beside a box or a link, not on it, still chooses it. Where several are near, tapping again
      in the same place chooses the next, round to the first. Two quick taps or a double-click on or near things only
      choose, and never zoom (slice 2).
### Size, time, themes and schemas

- [ ] **V-09** A 50-thing graph is drawn in under half a second on the phone (§11).
- [ ] **V-10** A huge graph shows its text with a banner. The graph has over 2,000 things: graph theory and this
      project, made by a script.
  - The banner has an icon, and the limit and the numbers in words.
  - Obsidian stays responsive: the note scrolls and other blocks draw while it is checked. This holds on the desktop and
    on the phone (§9, layout_contained; the tests run the worker in a Node thread, not a web view).
  - The text has no Export button. With no drawing there is nothing to export, and an export is held to the same limits.
- [ ] **V-11** A graph whose layout runs past five seconds shows its text with the "took too long" banner and a clock
      icon. The next graph still draws. The console says nothing about the main thread: the layout ran in a worker (§9).
      The text has no Export button either.
- [ ] **V-12** The drawing reads well in the light theme and in the dark theme. Dark, several drawings in a note, each card
      standing out: Mac ✓ 0.3.0, 9 Oct 2026 (relayed as the Mac). The light theme, and the phone, to come.
- [ ] **V-13** A block that holds only a graph's schema is drawn as the schema. Each kind is a box. Each relationship
      type is an arrow between the kinds it joins, read by its reading. A type not used yet is a box saying so. Source
      shows its text, and the card offers no Edit here (§3, schema_drawn).

## Zoom — spec §3

- [ ] **Z-01** Desktop: the mouse wheel alone scrolls the note. With Ctrl or Command it zooms about the pointer, and so does a
      trackpad pinch, a little quicker than the fingers move.
- [ ] **Z-02** Desktop: dragging empty space pans once zoomed in. Plus, minus and zero work when the drawing has focus.
- [ ] **Z-03** Phone: one finger on a fitted drawing scrolls the note. A pinch zooms about the fingers, a little quicker than
      they move, and once zoomed in, one finger pans.
- [ ] **Z-04** Double-clicking or double-tapping empty space zooms in there; on or near a box or a link it only chooses, and
      never zooms. Fit returns to the whole drawing.
- [ ] **Z-05** Zoom stops at four times natural size. Going out, it stops where the whole drawing fits (natural size
      when it fits larger). Text stays sharp at every level.
- [ ] **Z-06** Full screen covers the window, inside the phone's notch and home bar. Escape or Close leaves it. In full screen
      the wheel alone zooms.
- [ ] **Z-07** Double-clicking the drawing to zoom, or dragging across it, never highlights the words of its boxes and links.
      iPhone ✓ 5cfeac6, 8 Oct 2026.
- [ ] **Z-08** In a locked graph, a kind or link type its schema does not declare shows a ⚠ on its line. A link type with no
      reading of its own reads back as an arrow (Drive —HOPE→ …), not as a guess at words. iPhone ✓ 5cfeac6, 8 Oct 2026.
### Reading view and the phone

- [ ] **Z-09** Reading view is read-only: the bar offers Source and no Edit. Source shows the block's text, coloured, in
      place of the drawing. Pressed again, it brings the drawing back.
  - A hover preview or an embed is read-only too, an embed even inside a note in Live Preview.
  - Properties are shown but never added or changed: no Add property, no field, no type menu, no x or add field on a
    list.
  - There is no Park for later, and no fix that writes a suggested name. There is no Record a path or Make a view, and
    no Fade or Hide others or Save as shown.
  - There is no Edit here or Edit in pane, even while the block is edited in Live Preview. The same holds in full screen
    opened from reading view.
  - A ThoughtKnot pane already open on the block keeps saving while another pane shows the note in reading view.
- [ ] **Z-10** Only one set of zoom controls appears: the Mermaid Zoom plugin does not add its own to a graph drawing.
- [ ] **Z-11** Phone: zoomed in, one finger pans the drawing and a pinch zooms it. Neither slides Obsidian's side panels
      in nor moves the window; a box held and dragged does not either. On a fitted drawing a sideways swipe still opens
      them.
- [ ] **Z-12** Phone, Live Preview, the note just opened and scrolled down: the first tap on Zoom in zooms. The page
      does not jump to the top. Nor does it jump on the first tap on Find, which opens its box.

## The edit pane — spec §4, §5, §9

- [ ] **P-01** Edit opens a pane beside the note, on the block that was tapped. A note with several graphs offers a picker.
- [ ] **P-02** The text is coloured as gql-highlight colours it, and each line is read back in plain language beside it.
- [ ] **P-03** Typing a misspelt name underlines it with a ⚠. Its fix is offered on that line, and pressing it fixes the text.
- [ ] **P-04** Names, kinds and relationships already in the graph are suggested while typing. On the desktop, Tab takes the first.
- [ ] **P-05** What is typed reaches the note within about a third of a second, and the drawing follows. Renaming or
      moving the note while typing changes nothing: what is typed next still reaches it. Deleting the note while typing
      keeps what was typed as a draft, and the pane says so. The command Recover kept drafts into a new note writes it
      into a note.
- [ ] **P-06** Editing the same block in the note while typing in the pane: the pane reloads the block. It says what was
      typed is kept as a draft, and Restore draft brings it back.
- [ ] **P-07** Undo and Redo take back and put back each change in the note.
- [ ] **P-08** Typing ( to start the next pattern on a new line adds the comma to the line before. Typing ] after a link
      type written without its colon, such as -[favours, adds the colon and writes the type as the graph spells it,
      [:FAVOURS]. One undo takes either back. Both work in the pane, in place and in the note itself.
- [ ] **P-09** In the note itself, try it with Obsidian's "Auto pair brackets" on (Settings → Editor), and again with it
      off. The comma comes when ( is typed, and the colon when ] is typed or stepped over.
### Completing, suggested names and declared types

- [ ] **P-10** Completing as you type, in the pane and in the card: typing { shows a faint } after the caret. The text
      after it does not move.
  - Tab writes it with the caret left inside. Escape puts it away until the next typing. One undo takes back what Tab
    wrote.
  - Typing the closer yourself where one is already there steps over it (and a stepped-over ] still gets its colon). One
    undo goes back to the text as it was on screen.
  - Likewise a keyword (MA), a kind after (z:, a type after -[:, a property name after {, and a value already used after
    name: '; Enter takes these too. But Enter never takes a closer, and with nothing to take it is a new line.
  - After a bare ( the names are suggested and Tab takes the first, as before.
  - On the phone, Enter on the keyboard takes a word (there is no Tab). Confirm that the Enter ending an IME composition
    (for example, a Japanese keyboard) takes nothing.
- [ ] **P-11** A thing given text but no name, such as `(:Option {name: 'Large reader'})`, is drawn, and shows a ⚠
      naming the suggested name. The name is in the style of the names already in the graph, and not one of them. Its
      fix puts the name after the (, and the ⚠ goes.
  - A thing given a name but no text, such as `(large_reader:Option)`, shows an ℹ hint, not counted on the badge. It
    suggests the text from the name, and its fix adds `{name: 'Large reader'}`.
  - Nothing is written until the fix is pressed.
- [ ] **P-12** A graph locked by an earlier build shows a ⚠ that its schema does not declare its types. Its fix adds the
      DECLARES links, and the ⚠ goes.
- [ ] **P-13** A link type left without its colon is drawn as that type, with a ⚠ whose fix writes the colon. A new type written
      without its colon is an error that says to write it.
### Locking a graph, and the phone

- [ ] **P-14** A draft graph offers Lock the graph. Locking writes its schema as a new block after the graph.
- [ ] **P-15** Lock a graph built over two blocks, from its first block. The schema declares every kind and relationship
      of both blocks, and the graph then shows no problems.
- [ ] **P-16** Phone: the pane offers Drawing and Text as two tabs, with problems in a sheet at the bottom. Every button is easy
      to hit with a thumb, and nothing needs a hover.

## Editing in place and the inspector — spec §4, §14

- [ ] **I-01** Edit here opens the text inside the drawing's card, and typing there redraws the drawing without losing the place.
- [ ] **I-02** Straight after the app starts or reloads, and on a card far down a long note scrolled to only then: Edit here
      opens the editor in that card, and Done closes it with what was typed in the note. Edit here never does nothing
      without saying why. Pressed twice quickly, it opens one editor, with the focus in it, never two.
- [ ] **I-03** In the card, the text box is as tall as the text and one more line. There is no empty area below it for
      the caret to land in. Each read-back sits on its own line's right, never wrapping under it, and typing lands where
      the text shows. iPhone ✓ 5cfeac6, 8 Oct 2026.
- [x] **I-04** Live Preview: typing in a card never moves the page, with the card's top above the view or the note
      scrolled to its end. The box stays where it is on screen, and the note's other text with it. Mac ✓ 0.3.0, iPhone ✓
      0.3.0, 9 Oct 2026.
- [ ] **I-05** Typing in the card, character by character, redraws the drawing and never takes the focus from the box.
      The caret, the selection and where it is scrolled stay put.
  - Typing a comma at a line's end keeps the box in its card.
  - Undo (⌘Z, or Edit → Undo, or the phone's undo gesture) takes back a run of typing at a time, even after redraws.
  - A line may be added above the block, or taken away, while the card is edited. The box stays in its card, with its
    selection and its undo history. Mac ✓ 3d34e0d, reading view, 9 Oct 2026 (traced in the app); Live Preview and the
    phone to come.
- [x] **I-06** Desktop: hovering the mouse over the box in the card, and clicking into it, never turns it grey or hides
      its coloured text. No tooltip appears over it. Mac ✓ d601110, 8 Oct 2026.
- [ ] **I-07** While the card is being edited, its pencil shows as a book (view) icon. Pressing it writes what was typed and
      closes the box, as Done does, and the pencil comes back. Mac ✓ d601110, 8 Oct 2026.
### The inspector's properties

- [x] **I-08** In edit mode, tapping a box or a link shows its properties. They look as a note's Properties panel looks
      in this theme, in both light and dark. They have the same rows, icons, spacing, type and colours. Mac ✓ 0.3.0,
      iPhone ✓ 0.3.0, 9 Oct 2026.
- [ ] **I-09** A number has a number field, a date opens the date picker, and true or false is a checkbox.
- [ ] **I-10** A value is written when its field is left; a value that does not fit its type says why, and nothing changes.
- [ ] **I-11** Tapping a property's icon opens a menu to change its type or remove it. Add property adds a row in place, its
      name suggested from the names already used.
- [ ] **I-12** A text property with several values (`tags: 'quiet, cheap'`): the icon's menu lists List after Text.
  - Choosing it shows two fields, a kind and a relationship. They are filled in from the property's name, and offer the
    kinds and relationships the graph already uses.
  - Make list turns each value into a thing of that kind, linked from this one, and the property row becomes a row of
    chips.
  - Cancel puts the field back. Undo (⌘Z, or the phone's gesture) takes the whole change back in one step.
  - A thing with the same name that already exists is linked, not written again.
- [ ] **I-13** A list's chips look as a note's list property looks in the Properties panel in this theme, light and
      dark.
  - The x on a chip removes it: the link goes, and the thing too when nothing else links to it. A line under the rows
    says which.
  - The add field adds a value on Enter, or when it is left. An empty value, or one already there, says why and writes
    nothing.
  - Phone: the chips, their x and the add field are easy to hit in the sheet. The keyboard does not cover the field
    being typed in.
### Done, lists and where the properties show

- [ ] **I-14** Tap a box so its properties show, then press Done (or the book icon). The properties stay open but
      read-only, as a tap shows them outside edit mode. There are no fields, no Add property, no x on a chip and no add
      box. Pressing Edit here again, and tapping the box, brings the editable properties back. Details closed before
      Done stay closed.
- [ ] **I-15** Add a property named `rivals` and choose List. The form says, in one sentence, that the values become things
      linked by the relationship and that the row is named after it. After Make list the row reads `rivals · HAS_RIVAL`
      for as long as the editor stays open, and `HAS_RIVAL` alone after Done and a reload. A value typed in as
      `Reading tablet` is written as `reading_tablet` when the graph's names are snake case, with the words kept as its name.
- [ ] **I-16** Phone and desktop: put the properties lower down the screen, so the icon is near the bottom of the
      window. The property type menu opens above the icon and shows every item down to Remove, Checkbox included. With
      room below, it opens under the icon as before. On the phone, where the rows are taller, it also fits.
- [ ] **I-17** While editing, in the card or the pane, choosing a box selects the pattern that writes it in the text.
      Choosing a link selects its brackets and arrow (slice 2).
- [ ] **I-18** Phone: the properties open as a sheet at the bottom of the screen, and every field and icon is easy to hit.
### Suggested names and adding a thing

- [ ] **I-19** A thing written without a name (`(:Option {name: 'Small reader'})`), checked on desktop and phone, light
      and dark.
  - Its box is drawn under the suggested name, with a dashed outline and "✎ SUGGESTED NAME" under its text. The mark is
    readable and not shown by colour alone.
  - Tapping it opens its details like any box's: "✎ Suggested name: small_reader — not written yet". Outside edit mode
    nothing can be written there; the note is unchanged.
  - While editing, tapping it selects `(:Option {name: 'Small reader'})` in the text, and the details offer "Add the
    name small_reader". Pressing it writes the name after the `(`. The box is redrawn solid and unlabelled, and the
    warning leaves the problems list.
  - One undo (⌘Z, or the phone's gesture) takes the name back out, and the dashed box and the warning return.
  - While the name is not written, nothing else writes it. Park it and Save path (a path through it) are refused. So are
    Write the view (a view picking it), a property changed or made a list, and Save as shown with it selected. Each is
    refused with a message beginning "accept its name first", and the note is unchanged.
  - Phone: the button is easy to hit in the sheet (slice 2, unnamed_drawn_suggested).
- [ ] **I-20** Edit here on a card, press Add a thing: it asks for the thing's text first, with the focus in it.
  - Type some (such as "Small reader"): the name suggested from it appears, small_reader. It is in the style of the
    names already in the graph, and not one of them. The text of the block is unchanged.
  - Give the kind Option and press Add the thing: `(small_reader:Option {name: 'Small reader'})` is written after the
    block's last item. The name shown is the name written, and one undo takes it back out.
  - A name typed in its own field is kept as the text changes.
  - No text, a name the graph has, or more than one word is refused in words, and nothing is written. So is a word the
    language keeps, or a kind the graph keeps for its schema.
  - Enter in a field adds the thing and Escape cancels. Desktop and phone: every field and button is easy to hit (slice
    2, add_thing).

## The style graph — spec §2, §6

- [ ] **S-01** A note with a graph and its style block (`// graph: reader_style · STYLE reader`, with a direction nudge
      TB and a beside nudge). The style block shows as one folded line, "Style of graph reader: 2 nudges", opening to
      its text. The graph runs top to bottom with the two things side by side (slice 2, style_block_in_note,
      style_is_a_graph).
- [ ] **S-02** Change a nudge's word to `besides`: the fold says "⚠ 1 problem". The graph's badge lists "a nudge must be
      one of four words…", and the graph is still drawn (four_nudge_words, nudge_problems). Break the block's text: the
      graph is drawn in the locked style and the problem listed (broken_style_block).
- [ ] **S-03** Desktop: drag a box with the mouse to just below another box. It follows the pointer, the other box is
      outlined, and a line at the top says "Put … beside …". Let go: a notice says "Moved: …", the style block gains a
      beside nudge and the two are drawn side by side. Drag again and press Escape: the box goes back and nothing is
      written. A short click still opens the box (nudge_preview, drag_moves_box).
- [ ] **S-04** Phone: hold a finger on a box for a moment. It lifts (a shadow) and its tooltip opens. Drag it to just
      below another box: the page does not scroll, the line says "Put … beside …", and letting go writes the nudge. A
      swipe begun at once still scrolls the note, and a hold lifted without moving opens no details (hold_to_drag_touch).
- [ ] **S-05** Keyboard: Tab to a box and press M. The line at the top says "Put … (1 of …)" and the box it would go by
      is outlined. The arrow keys step through the places; Enter writes the nudge and says "Moved: …"; Escape writes
      nothing. Move… in a box's details does the same. In reading view there is no Move… (move_box_keyboard).
### A radial drawing

- [ ] **S-06** In a radial drawing, drag a box to just past another one around the centre. The line says "Put … before
      …" or "… after …", never beside, and letting go moves the box round to that place (radial_spoke_order).
- [ ] **S-07** In a radial drawing, open a box's details and press Centre here. The boxes glide to their new rings
      around it, and the strip says "Centred on …". Back to the usual centre glides them back. Tab to a box and press
      C: the same. In reading view it is only looked at: "Just looking: not saved." With reduced motion on, the boxes
      move at once (radial_centre_pick).
- [ ] **S-08** In a network, right-click a box: a menu says Centre here. Pick it: the boxes glide out into rings
      around that box. The strip says "Centred on …" and how to pick another. Select a box, open Diagram type: the tile
      says "Radial, around …". On a phone, tap a box and press Centre here in its details. In reading view each is
      only looked at (radial_centre_anywhere, radial_centre_menu, radial_centre_hint).

## Views — spec §2, §7

- [ ] **W-01** A view block (`// graph: trip · QUERY view round_park` with `MATCH (n {id: 'park'})-[]-{1,1}(m) RETURN n,
      m`): its card says "View round_park: everything within 1 step of The park". The things outside it are faded. Hide
      others writes `outside: 'hide'` into the style block. The card redraws with only the view (slice 2,
      views_in_the_note, view_is_query, fade_or_hide_in_style).
- [ ] **W-02** Each of the five kinds draws: picked by hand, near a thing and how one reaches another. So do only some
      kinds (`MATCH (n IS Place|Person) RETURN n`) and a walked path (five_view_kinds). A query of another shape is
      refused, the card naming the five shapes (view_profile). A view of a thing not in the graph says it matches
      nothing. It offers Change the view, which opens the note at the view (empty_view).
- [ ] **W-03** A Look with a colour and its meaning: the thing is drawn in that hue, readable in light and dark. The
      legend shows the swatch and the words (styled_paths_and_views, styling_keeps_locked_rules).
- [ ] **W-04** Edit here, Make a view: tap two boxes; the strip says "The view: A and B, picked by hand." Switch to Near
      a thing, tap one, choose 2 steps. Then How one reaches another, tap two; then Only some kinds, tap one. Name it
      and Write the view: a view block appears after the graph, and draws (slice 2, views_by_tapping). Phone: every
      control easy to hit.
- [ ] **W-05** Zoom in, select a box, Save as shown: the style block gets a Shown. Close and reopen the note: the view
      opens at that zoom with that box's details open (view_saved_as_shown).

## Parked for later — spec §5, §8

- [ ] **D-01** Edit here on a card, tap a box, press Park for later, fill what is needed and why, press Park it.
  - A Deferred is written into the block. When the card redraws, the box is dashed with "⏳ later" at its top right,
    readable in light and dark. The badge says "No problems, 1 parked".
  - On a box drawn under a suggested name (I-19), Park it is refused with "accept its name first". Nothing is written
    (slice 2, park_for_later, deferred_drawn, parked_not_broken).
- [ ] **D-02** Change its revisit_by to a day in the past. The mark says "⏳ overdue", and the badge adds "1 overdue".
      The list behind the badge names it with what is needed. VoiceOver reads the box as "parked for later, overdue".
- [ ] **D-03** Take a locked graph whose schema does not declare Deferred and DEFERS. Edit here, tap a box, press Park
      for later, fill the form and press Park it.
  - The message says to declare them. A button "Declare Deferred and DEFERS in the schema" appears below it. It is as
    big as the other buttons to touch, and read by VoiceOver.
  - Press it: the two declarations are written at the end of the block that holds the schema. That is in the text being
    edited, or, when the schema is in a later block, in that block of the note.
  - The Deferred is written with what you typed in the form, and the badge says "No problems, 1 parked"
    (park_for_later). Pressing the button twice fast parks once.
  - Blank What is needed first and press it: nothing is declared, and the message says what is missing.
  - Undo takes back the park. When the schema is in the same block, it takes the declarations back with it. When the
    schema is in another block, the declarations are not undone with the park, and stay until removed by hand.

## Walked paths — spec §7

- [ ] **T-01** Edit here, press Record a path, tap three boxes. Each shows its number at its top left as it is tapped (a
      box tapped twice shows both). Undo step takes the last back.
  - Give a title and Save path: a Path with STEP 1 to 3 is written; the card redraws.
  - A path through a box drawn under a suggested name (I-19) is refused with "accept its name first". Nothing is written
    (slice 2, record_and_play, walked_path_is_data, steps_numbered).
- [ ] **T-02** Press Play <title>: "Step 1 of 3: …" is shown and read by VoiceOver, the box outlined heavier; Next and Previous
      move one step, and stop at the ends; Stop playing clears it. Desktop and phone, light and dark.
- [ ] **T-03** Rename one stepped thing: the problem names the step and offers Remove the step. Pressing it renumbers
      the later steps (slice 2, path_missing_step). A Path with no STEP shows "the path … has no steps" and no Play
      (path_no_steps).

## Export — spec §16

- [ ] **X-01** Mac: Export on a card, The whole diagram, SVG, Light, Export it. A file `<note>-<graph>-<day>.svg`
      appears next to the note.
  - Opened outside Obsidian (Finder's Quick Look), it reads the same. It has the graph's name, its legend, and "From
    <note>, exported <day>" (slice 2, export_two_scopes, export_formats, export_self_explaining, export_fixed_theme).
  - Dark: the same in dark colours.
  - The console says nothing about the main thread: the export was laid out in the worker, as a drawing is (§9,
    layout_contained).
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

- [ ] **C-01** Settings › ThoughtKnot, desktop and phone: one page, with Strictness, AI models, Formatting and Drawing, each
      option with a sentence saying what it does. Searching the settings for "strictness" finds it (slice 2,
      settings_page).
- [ ] **C-02** Strictness Standard: a block missing a comma at a line's end shows it as an error (✖) behind the badge, and is
      still drawn. Forgiving (the default): a warning (⚠). Simplified with "A missing comma" on: no problem at all
      (slice 2, strictness_levels).
- [ ] **C-03** With such a note in front, try "Convert this note to standard GQL" from the command palette, and the
      button on the page. The comma is written, and a notice says how many were converted. One undo takes it back (slice
      2, simplified_back_to_standard).
- [ ] **C-04** AI models: Add a model, open Model 1, fill its name and purpose, pick a ceiling, and choose a key with the app's
      own key field. Close and reopen the page: all kept. The plugin's data.json in the vault holds the key's name, never
      the key (slice 2, settings_ai_models).
- [ ] **C-05** Indent "Two spaces", then Lock the graph on a draft: the schema's later lines start with two spaces. Direction
      "Top to bottom": every drawing runs top to bottom; "Best fit" restores the old choice (slice 2,
      settings_formatting).
- [ ] **C-06** A note with a line that cannot be read is in front. Run "Convert this note to standard GQL" from the
      command palette. The note is left as it is, and the notice says why (slice 2, simplified_back_to_standard).
- [ ] **C-07** The pane in front shows a note in reading view. Try "Convert this note to standard GQL" from the command
      palette, and the button on the page. The note is left as it is, and the notice says why.
  - With no note in the pane in front (the ThoughtKnot pane, a canvas, a PDF, an empty tab), nothing is converted. The
    notice says the pane holds no note.
  - The pane in front decides: in Live Preview it converts, even while another pane shows the note in reading view.

## Accessibility — spec §8, §11

- [ ] **A-01** Desktop, keyboard only: Tab reaches every button, the drawing, each box and each estimated link. Enter opens a
      box's details or an estimate's reason.
- [ ] **A-02** With VoiceOver: the drawing is described as a list of sentences. A new problem typed in the pane is
      announced without the focus moving.

## Focus and untangle — spec §25

- [ ] **F-01** Tap a box: it, its links and the boxes at their other ends stay filled, with the heavier outline. Every
      other box becomes an empty outline, and its words stay as easy to read. Nothing moves or disappears. Tap empty
      space, or press Escape: everything is back as it was. Desktop and phone, light and dark (slice 3,
      focus_neighbours, focus_readable, focus_cleared).
- [ ] **F-02** Tap a link: it and the two boxes it joins stay at full strength and the rest fade. Set Settings ›
      ThoughtKnot › Focus reaches to Two steps. Tap a box: the boxes two links away stay at full strength too (slice 3,
      focus_link, focus_depth).
- [ ] **F-03** Mac, pointer: point at a box, and it gets a glow round its outline and its words are underlined. Point at
      a link, and the link and its two boxes do. Point at a faded box while one thing is selected, and it comes forward
      until the pointer leaves. Nothing in the drawing shifts or changes size (slice 3, hover_highlight, hover_still).
- [ ] **F-04** Without a pointer: on the phone, a tap that selects a box gives it the same glow and underline. They stay
      until something else is chosen. On a keyboard, Tab to a box or a link gives them too (slice 3, hover_not_alone).
- [ ] **F-05** Zoom in, open a box's details and press Show only this and its neighbours. The rest disappears, and
      those left glide together. A banner names the box and the steps; the button says Show the whole graph. The − and
      + under it change the steps, up to 3. Press the button again: all comes back as drawn, at your zoom (slice 3,
      untangle_neighbourhood, untangle_toggle, untangle_regroup, thing_controls).
### Filter, shortest path, find and the arrow keys

- [ ] **F-06** Press Filter by kind or link: each kind and relationship type is a button with its count. Choose one: it comes
      forward, the rest fade, and the button says "in front". Choose it again: it is hidden, struck through, and says
      "hidden". Once more: it is back (slice 3, untangle_legend).
- [ ] **F-07** Open a box's details, press Shortest path to another thing, then tap a second box. The path stays at full
      strength, and the banner reads out the boxes along it. With a box that has no route to it, the banner says there
      is none. Clear the path puts the focus back (slice 3, untangle_path).
- [ ] **F-08** Zoom in far, press Find a thing and type part of a name or of a property's value. The matches are listed
      with their kind. Choose one: its details open and it is brought into view. Escape closes the search and returns to
      its button (slice 3, untangle_find).
- [ ] **F-09** Select a box, then press the arrow keys. The selection moves along a link to the neighbouring box in that
      direction. Every neighbour can be reached by some arrow. Nothing in the note changes in any of this (slice 3,
      untangle_keyboard, untangle_data_untouched).

## Proposals — spec §17

- [ ] **R-01** Phone: a change set proposed against a graph (`// graph: reader · CHANGE SET …`), in Live Preview.
  - The changes are listed in a sheet at the bottom of the screen, one to a row. Each is in plain language, with its own
    Accept and Reject. Every button is easy to hit with a thumb.
  - The drawing above marks what is added, changed and removed, in words as well as in its outlines.
  - Accept one change: only it is written into the graph, and its row says it was accepted. Reject another: the graph
    block is the same, and the change set records it. Undo takes the last decision back.
  - A graph changed since the proposal was made shows a notice first. Accept stays off until the notice is marked read
    (slice 3, proposals_phone, proposal_provenance, person_decides).

## Details and the sheet — spec §25

- [ ] **G-01** Tap a box with several links of one type: its details list them by type and way, in words. Each group is
      listed once, with a count where there are several, such as "is answered by Kindle and Tablet (2)".
  - Each name is underlined. Tap one and it becomes the selection, its details open and the drawing glides to it at the
    same zoom.
  - Zoomed far out, it is brought up to a size that can be read (slice 3, details_links_listed, details_choose_moves).
- [ ] **G-02** Turn on Settings › Accessibility › Reduce motion on the Mac, or Reduce Motion on the iPhone. Choosing a
      linked thing jumps straight to it, with no glide. With it off, the glide is brief. The box is marked selected and
      named in the details as the glide starts (slice 3, details_move_motion).
- [ ] **G-03** Choose three things in turn from the details, then press Back twice and Forward once. Each step returns
      to the thing it names. Tapping a box in the drawing starts the trail again (slice 3, details_trail).
- [ ] **G-04** Select a box, then zoom in until it is out of sight: a round arrow at the edge of the drawing points to it.
      Tap the arrow: the box comes back into view and the arrow goes (slice 3, selection_pointer).
### The details sheet

- [ ] **G-05** iPhone, reading view and Live Preview, a card taller than the screen: tap a box near the foot of the
      screen.
  - The details open as a sheet at the foot of the screen, over the card and as wide as it. The drawing moves up so the
    box sits above the sheet.
  - Scroll the note: the sheet stays where it is. Scroll the card off the screen: the sheet goes, and comes back with
    the card.
  - Same on the Mac (slice 3, details_on_screen, sheet_pinned, sheet_keeps_thing_clear).
- [ ] **G-06** Press the arrow in the sheet's header: it shrinks to a bar with the box's name and kind, and the drawing
      settles. Press it again and the full details return, scrolling inside the sheet. The sheet never covers more than
      about half the screen. Minimise it, close it and tap another box, in this card or another: it opens minimised
      (slice 3, sheet_min_max, sheet_state_remembered).
- [ ] **G-07** Close the sheet with its x, with Escape, and by tapping empty space in the drawing: each closes it and clears
      the selection. In Live Preview, with the sheet open, click into the note's text and type, Escape and the arrow
      keys included: every key reaches the note. With VoiceOver, the arrow and the x are read as "Minimise details" and
      "Close details", and Tab reaches both (slice 3, sheet_closed, sheet_reachable).

## Diagram types — spec §15

- [ ] **E-01** Diagram type on a card lists Network, Tree, Flow, Radial, Lanes, Timeline and Table. Each that fits can
      be pressed, and each that does not is greyed with why beside it. One says "suggested". The card says "Drawn as a
      network" until a type is pressed.
  - Press Tree: a Diagram is written into the style block, never the data. The card redraws top to bottom (slice 3,
    diagram_type_set, type_only_when_fits, suggest_type, type_remembered).
- [ ] **E-02** Press each type in turn, in light and dark: every box keeps its kind's colour, and every link its
      reading's. The words are the same sizes, and all read as clearly as in the network. A table's rows read the same
      way (type_one_look).
- [ ] **E-03** In each type, the table among them: tap a box or a row for its details; Edit here, then change a property in
      the inspector; zoom in and out with the buttons and a pinch, Fit, and Full screen. Each works as in the network
      (type_one_way_to_work).
- [ ] **E-04** On the tree, give a thing a second parent: the card says the graph no longer fits a tree, and why. It
      draws it as a network, and offers Use flow. Press it, and the style block now says flow (type_stops_fitting).
- [ ] **E-05** Phone: a wide flow, a wide tree and a wide timeline each show at a readable size, fitted top to bottom. A
      finger moves the drawing sideways only, and up and down still scroll the note (wide_types_phone).
- [ ] **E-06** A graph of 1,001 things says it has too many to read in one drawing and offers Show as table and a view;
      Show as table draws it as a table (large_way_in).

## AI models — spec §19

Run these on the Mac and the phone with aeroplane mode off. You need a model of your own to send to: a local one
(Ollama or LM Studio on the Mac) is enough. Use a throwaway key, never a real one, and only the dummy notes of the test
vault.

A note with no classification counts as the most sensitive level. So, by default, it goes to no model. Give each note a
classification of Public in its front matter first, and take it out again afterwards.

- [ ] **U-01** Use AI models is off until you turn it on. With it off, run "Ask an AI model to propose changes" from the
      command palette. A notice says AI is off, no dialog opens, and nothing is sent. Turn it on with no model set up:
      the notice says to set one up. Obsidian has no AI of its own. So the dialog offers only the models you set up
      (slice 3, ai_off_until_chosen, host_ai_first).
- [ ] **U-02** Set up two models. One is on this device by `http://localhost`, for Proposing changes. The other is by
      `https://`, for Research questions, its key chosen with the app's own key field.
  - A remote address written with `http://` is said on its model's row to need https.
  - In the dialog the model for proposing changes is offered first. data.json holds the key's name, never the key (slice
    3, user_models, models_by_purpose, keys_kept_secret).
- [ ] **U-03** In the dialog, choose a model and press Show what will be sent. The exact request is shown, with the
      model, its address, the headers (the key only by its name) and the note's classification. Send stays off until
      then.
  - Change the question: Send goes off again until it is shown again.
  - Press Send: exactly that goes, once. The answer arrives as a change set under the graph, each change waiting to be
    accepted or rejected. The graph block is unchanged (slice 3, seen_before_sent, never_in_background,
    answers_are_proposals).
### What is sent, classifications and failures

- [ ] **U-04** Choose "A view of it", then "Only the things ticked" with two things ticked, pressing Show what will be
      sent each time. What is shown holds only those things and the links between them, and none of the note's prose
      (slice 3, user_chooses_what).
- [ ] **U-05** Give the note a classification above the chosen model's ceiling. Show what will be sent says why, names a
      model cleared for it, and Send stays off.
  - At the highest classification set, nothing is sent to any model; nor is a note holding a password property.
  - With no classification the note counts as the most sensitive level, so it goes to no model. The dialog points to the
    setting Unlabelled notes count as. Set that to Internal, and it goes to a model cleared for Internal. It goes to
    none cleared only for Public (slice 3, model_ceiling, never_above_ceiling, never_credential,
    unclassified_strictest).
- [ ] **U-06** Stop the local model's server and send. A notice says the model could not be reached and that nothing was
      changed, and the note is as it was.
  - The plugin's data.json lists the last sends, failed ones too. Each has a digest and the size of what was sent (never
    its text), the model and the time, and never a key. "Clear the record of sends to AI models" empties it (slice 3,
    ai_unreachable, record_every_send).

## Sources and steps — spec §7, §20

The .gql file of Q-03 and Q-04 is made by the generator. Run `node scripts/reset-test-vault.mjs` (or
`node scripts/make-test-files.mjs`) in the repository, and `Graph files/trip.gql` is written at the root of the vault.
Nothing is put in by hand. On the phone it arrives only when Obsidian Sync's "Other file types" is on.

- [ ] **Q-01** Two views of one graph in one note, the graph block above them. Each card draws only its view, from the
      one graph block, and the things outside it are faded. Change a name in the graph block: both views draw the new
      name. Nothing of the graph is copied into the views' blocks (slice 3, many_views_one_data).
- [ ] **Q-02** A note whose block says `// graph: trip · FROM [[…]]`, naming the note of Q-01, with a view under it.
  - The FROM block draws the whole graph of Q-01, read-only, and the view draws its part. Each is under a line saying
    "Drawn from the note …" with an Open button that opens Q-01.
  - Change a name in Q-01's graph block and come back: both cards draw the new name. This note still holds none of the
    data (slice 3, many_views_one_data, view_of_another_note).
- [ ] **Q-03** Mac: the plain text file `trip.gql`, made by the generator (reset-test-vault), is in a folder `Graph
      files` at the root of the vault. It holds a graph that starts `// graph: trip`.
  - A block `// graph: trip · FROM Graph files/trip.gql` draws it, under a line naming the file. Edit opens this block;
    the bar has no Edit here.
  - Change the file in another editor and save it: the card draws the change. Add a line that cannot be read: the rest
    is still drawn, and the problem is listed (slice 3, gql_file_source).
- [ ] **Q-04** A block drawn from a file that is not there says which file and why, and is never a blank card. `Graph
      files/nowhere.gql` is "not in the vault". Move `trip.gql` of Q-03 into another folder. Q-03's card says at once
      that it is not there any more, and where a file of that name now is. Moving it back draws it again (slice 3,
      gql_file_missing).
### Graph steps

- [ ] **Q-05** A step, in Live Preview: its card says what it proposes into and what its point takes. It offers the
      note's graph and its view. Nothing in the note changes until Run is pressed.
  - Press Run with the graph chosen: a change set appears under the graph, each link waiting to be accepted or rejected.
    The graph block is the same.
  - Choose the view of people only and press Run: the card says which kind and which type it lacks, and nothing is
    written.
  - The step written as CALL says it never calls a named action, and has no Run.
  - In reading view no Run is offered (slice 3, graph_step_io, step_inputs_checked, run_declared_only,
    step_output_proposal).

## Link flow and path play — spec §7, §11

Run these with the system's reduce-motion setting off, as it is by default, until L-03 turns it on. The setting is:

- on the Mac, System Settings › Accessibility › Display › Reduce motion;
- on the iPhone, Settings › Accessibility › Motion › Reduce Motion.

- [ ] **L-01** A graph whose style block holds a Flow with dashes for one relationship type. The dashes run along each
      of its links, in the direction of its arrow, and each of its labels opens with ⇢. The other links are still.
  - Under the bar the legend says "⇢ moving dashes:" and what the movement means.
  - Take the Flow out of the style block. Every link is still and the legend goes (slice 3, links_show_flow,
    flow_in_style_graph, motion_not_alone).
- [ ] **L-02** A Flow with a dot for every link. A dot travels along each link, in the direction it reads, the link
      drawn from its far end too. Each label opens with •. With VoiceOver, a link is read with "a moving dot:" and what
      it means. A view whose Flow is still draws its links still (slice 3, links_show_flow, motion_not_alone).
- [ ] **L-03** Turn the system's reduce-motion setting on, and redraw the notes of L-01 and L-02. The dashes stand
      still, no dot is drawn, and the icons and the legend stay. Press Play on a path: each step is marked at once, with
      no pulse and no dot. Open an exported animated SVG in a browser: it is still, every step outlined and numbered.
      Turn the setting off again afterwards (slice 3, motion_reduced_respected).
### Path play and its export

- [ ] **L-04** Press Play \<title>: the path steps on its own, two seconds a step. The step now on is outlined and
      pulsing. A dot runs the link from the step before, when a link joins them. "Step 2 of 4: …" is said each step.
  - Choose Half a second a step under Pace: it goes faster at once.
  - Pause holds it on its step, and Play on carries on from there. Next pauses it. At the last step it stops. Stop
    playing clears it.
  - Desktop and phone (slice 3, path_autoplay).
- [ ] **L-05** While it plays, press Export as an animated SVG: the Export form opens on the path, SVG chosen, at the
      pace it was playing.
  - Export it, and open it in a browser: the image plays round and round. The outline moves from step to step, and a dot
    along a link between two steps.
  - Every step is numbered on its thing, and the frame says the walk in order and its pace. Nothing else needs to be
    installed (slice 3, path_animation_export).
- [ ] **L-06** iPhone: on the note of 201 steps, press Play and Export as an animated SVG, then Export it. The form says
      the animated SVG was not made. It says the path has 201 steps, more than the 200 an animated SVG can play smoothly
      on this phone. It says nothing was saved, and how to make it fit. Nothing is written. On the Mac the same path
      exports (slice 3, animation_export_fits).

## The View menu — spec §25

- [ ] **M-01** Press View on a graph's bar: four switches, Labels by zoom, Busy hubs folded, Groups folded and Parallel
      links merged. Each says on or off. Labels and hubs are on, groups and merging off. In Settings › ThoughtKnot,
      change a switch's default under Drawing, then open the note again. Its graphs start as the settings now say (slice
      3, view_switches, view_switch_defaults).
- [ ] **M-02** On the phone, a wide graph fitted to the note shows its boxes but no link labels. Pinch to zoom in, and
      the labels appear once they can be read. Tap a box: its own links keep their labels at any zoom, as does a link
      under the pointer on the Mac. Turn Labels by zoom off: every label shows at any zoom (slice 3, untangle_labels).
- [ ] **M-03** A thing with 13 links or more is drawn with its links folded into one dashed stub saying how many. Tap the
      stub: the links and the things on them come back, the drawing redrawn at once. Tap the thing and press Fold its 14
      links in its details: they fold again; Open its 14 links opens them (slice 3, untangle_hubs).
- [ ] **M-04** Turn Groups folded on: each group is one box with its name and how many things it holds. The links to its
      things run to the box. Tap a box, or press Enter on it: that group opens and the other stays folded. Find a thing
      inside a folded group: its group opens and it is selected (slice 3, untangle_groups).
### Merged links, routing and the selection

- [ ] **M-05** Turn Parallel links merged on: the links running from one group to the other share one thick trunk. Tap a
      link at either end: its details open, reading as before, and VoiceOver reads it as the same link. In the style
      block, merge: 'on' starts the graph merged (slice 3, untangle_merge).
- [ ] **M-06** In the style block, routing: 'straight' draws every link as a straight line, and routing: 'right-angled'
      as lines with right angles, each reading set beside its line; 'curved' is the drawing as before. A word that is not
      one of the three is a problem with its fix (slice 3, untangle_routing).
- [ ] **M-07** Select a box, then turn each switch in turn. The drawing redraws at once, the box stays selected, its
      details stay open and its neighbours stay in focus. Nothing in the note changes, in reading view too. In a view,
      Save as shown writes the switches into the style block. Close the note and open it again: the view opens with them
      (slice 3, view_switch_view_only, untangle_data_untouched).

## Animated images — spec §18, §11, §16

The images are made, not supplied. Run `node scripts/reset-test-vault.mjs` in the repository, or
`node scripts/make-test-files.mjs`, which makes only the test files. The generator writes every file a note names into
the folder `Device checks/20 Animated images`. These are real animated GIF, APNG, animated WebP and animated SVG images
under the names given. For K-05 it writes a GIF larger than 5 MB, which git does not keep and the script makes each
time. Nothing is put in by hand.

On the phone they arrive only when Obsidian Sync's "Images" file type is on. Each note says which files it needs. Reduce
motion stays off until K-04 turns it on.

- [ ] **K-01** Open the details of Ann. Under Images, cat.gif, spin.png, dance.webp and loop.svg each move, each with
      its name and a Pause button. A property naming an image outside the vault says it is not loaded, and shows nothing
      (slice 3, animated_image_shown).
- [ ] **K-02** A graph whose style block holds a Picture for the kind Cat: each cat's box shows its image moving. The
      image is at the top of the box above its kind, with a small pause button in the picture's corner. The dog's box
      has no picture. Light and dark themes both (slice 3, animated_image_shown).
- [ ] **K-03** Desktop: Tab to the picture's control on a box and press Enter. The picture stops on its first frame and
      the control shows Play. Press Space: it moves again. The details do not open. In the details, Tab to Pause and
      press Enter, then Play. Phone: tap the control on a box, then the button in the details. Each pauses and plays,
      and the tap never selects the box (slice 3, animation_pause_play).
- [ ] **K-04** Turn the system's reduce-motion setting on and redraw the note of K-02. Every picture and every image in
      the details is still, its first frame, each saying it is still as the system asks. Press Play on one: only that
      one moves. Turn the setting off again afterwards (slice 3, motion_reduced_respected).
### Limits and export

- [ ] **K-05** A thing whose image is the GIF of more than 5 MB: it is never read. Its box shows only its Play control
      where the picture would be, and its image in the details shows nothing.
  - Each says it is over the 5 MB an animated image may be, and gives the limits in a sentence. Pressing Play leaves it
    so and says why again.
  - The drawing is drawn at once, without waiting for it (slice 3, animated_image_limited).
- [ ] **K-06** Seven cats, each with an animated GIF and a Picture: six pictures move and the seventh is still. It says
      six are already moving here, and pressing its Play says so again. Pause one of the six, then press Play on the
      seventh: it moves (slice 3, animated_image_limited).
- [ ] **K-07** Export the note of K-02 as SVG: the notice says each cat's image was kept moving, and still under reduced
      motion. Opened in a browser, the file shows them moving, and still with reduce motion on. It loads nothing from
      elsewhere. Export it as PNG: the notice says each was reduced to its first frame, as a PNG cannot move (slice 3,
      export_animation_stated).

## Links and attachments — spec §18

- [ ] **H-01** A box whose name holds a link draws it in the link colour, underlined. Tap the box: its details list each
      link it holds under Links, by property, each underlined. Press Edit here and tap the box again: the inspector
      lists them too. In the text, the link inside its quotes is underlined (slice 3, links_shown).
- [ ] **H-02** Tap a link to a note in the details: Obsidian opens the note in the same tab. On the Mac, Command-click it:
      it opens in a new tab, as a link in a note does (slice 3, host_opens_links).
- [ ] **H-03** The generator (reset-test-vault) makes photo.png and report.pdf in the vault. The box that links both
      carries a paperclip and 2 at its top left. VoiceOver reads "2 attachments" with its name. Its details list them
      under Attachments (2), as "photo.png — image" and "report.pdf — PDF". Tap one and Obsidian opens it (slice 3,
      attachments_at_a_glance).
- [ ] **H-04** On the Mac, hold Command and point at a link to a note in the details: Obsidian's own preview of the note
      shows, as for a link in a note. On the iPhone, press and hold the link: the preview shows, and lifting the finger
      opens nothing (slice 3, link_preview).
- [ ] **H-05** Zoom in, tap a box, then tap a link to a note in its details: the note opens in the same tab. Go back:
      the graph is at the same zoom and place. The same box is selected, with its details open (slice 3,
      back_where_you_were).
- [ ] **H-06** A link to a note the vault does not hold is dashed in its box, and marked "names nothing" in the details.
      The problems badge lists that it names no note or file, with its fix. Change it to the note it most likely meant:
      the block is written with the right name. Create the note: the note is made, and the link is no longer broken
      (slice 3, broken_links_problems).
### Renames, web addresses and notes in the details

- [ ] **H-07** Rename a note that a graph block links to, in the file explorer. The link inside the block changes to the
      new name at once, its alias kept. With the note open in Live Preview while renaming, Command-Z takes the change
      back (slice 3, renames_follow).
- [ ] **H-08** Tap a web address in the details: a dialog shows the site large and says the link leaves Obsidian and
      what it opens; Cancel opens nothing, and Open hands it to the browser. On the Mac, a middle-click asks the same,
      and right-clicking it offers no menu to open it. A link to a javascript address is shown as text, never as a link,
      and tapping it does nothing (slice 3, safe_to_click).
- [ ] **H-09** On the Mac, open a box's details from the keyboard and press Tab: each link is reached in turn. Return
      opens the one reached (slice 3, links_by_keyboard).
- [ ] **H-10** A thing's details show its words as Obsidian shows them in a note: emphasis, maths and a link rendered,
      not as marks. An image from outside the vault is shown as a link only, and HTML written in a property as text (slice
      3, rich_details).
- [ ] **H-11** A thing whose id is a global note id, note: and the note's name, shows that note in its details. It is
      rendered, with Open beside it, and Open opens the note. A thing whose id is a link to the note does the same
      (slice 3, node_is_a_note).
- [ ] **H-12** With the phone online, take a thing that stands for a note holding a picture from the web, written as
      Markdown and as HTML. Its details show each picture only as a link with its address, and no picture is loaded. A
      note that note embeds is a link too (slice 3, rich_details).

## Result

Build: ____ · Device: ____ · Obsidian version: ____ · Date: ____ · By: ____

Failures, each with what was seen:
