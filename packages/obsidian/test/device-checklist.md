# Device checklist — the graph note editor in Obsidian

The scripted check run by a person in Obsidian on a desktop and on a phone, for what the automated tests cannot see:
how it looks, how the gestures feel, and that it works offline on a real device. Run it on each slice's build, on the
desktop and on the phone, and note the build, the device, the date and anything that failed. An item that has passed on
one device so far carries that device's mark, and is ticked once it passes on both.

Use a note that holds the graph guide's example: a graph built in steps over several blocks, a query block, and a
schema written last. Add one link with a misspelt name, and one empty graph block.

## Before

- [ ] The build is installed as real files in `.obsidian/plugins/graph-note/`, and has synced to the phone.
- [ ] Graph Note is switched on. If gql-highlight is also on, it has been reloaded since.
- [ ] The phone is in aeroplane mode for the whole check: everything below must work offline.

## Viewing — spec §3

- [ ] Every graph block is drawn in reading view, and in Live Preview with the cursor outside the block.
- [ ] Each step of the example draws the graph as built so far.
- [ ] The query block shows as coloured code with a copy button, not a drawing.
- [ ] The empty block shows a prompt to start with a thing, and an Edit button.
- [ ] Each drawing has a bar: problems badge, Fit, Zoom out, Zoom in, Full screen, Edit. The badge counts in words and
      shows an icon.
- [ ] The misspelt link is drawn dashed, labelled "⚠ … (estimated)". Tapping it explains it in one sentence.
- [ ] Tapping a box shows its text, its kind, and its links in and out.
- [ ] Tapping just beside a box or a link, not on it, still chooses it. Where several are near, tapping again in the same
      place chooses the next, round to the first, and two quick taps near things never zoom (slice 2).
- [ ] A 50-thing graph is drawn in under half a second on the phone (§11).
- [ ] The drawing reads well in the light theme and in the dark theme. Dark, several drawings in a note, each card
      standing out: Mac ✓ 0.3.0, 9 Oct 2026 (relayed as the Mac). The light theme, and the phone, to come.

## Zoom — spec §3

- [ ] Desktop: the mouse wheel alone scrolls the note. With Ctrl or Command it zooms about the pointer, and so does a
      trackpad pinch.
- [ ] Desktop: dragging empty space pans once zoomed in. Plus, minus and zero work when the drawing has focus.
- [ ] Phone: one finger on a fitted drawing scrolls the note. A pinch zooms about the fingers, and once zoomed in, one
      finger pans.
- [ ] Double-clicking or double-tapping empty space zooms in there. Fit returns to the whole drawing.
- [ ] Zoom stops at a quarter and at four times natural size, and text stays sharp at every level.
- [ ] Full screen covers the window, inside the phone's notch and home bar. Escape or Close leaves it. In full screen the
      wheel alone zooms.
- [ ] Double-clicking the drawing to zoom, or dragging across it, never highlights the words of its boxes and links.
      iPhone ✓ 5cfeac6, 8 Oct 2026.
- [ ] In a locked graph, a kind or link type its schema does not declare shows a ⚠ on its line. A link type with no
      reading of its own reads back as an arrow (Drive —HOPE→ …), not as a guess at words. iPhone ✓ 5cfeac6, 8 Oct 2026.
- [x] Reading view is read-only: the bar offers Source and no Edit. Source shows the block's text, coloured, in place of
      the drawing, and pressed again brings the drawing back. A hover preview or an embed is read-only too.
      Mac ✓ c16c956, iPhone ✓ c16c956, 9 Oct 2026.
- [ ] Only one set of zoom controls appears: the Mermaid Zoom plugin does not add its own to a graph drawing.

## The edit pane — spec §4, §5, §9

- [ ] Edit opens a pane beside the note, on the block that was tapped. A note with several graphs offers a picker.
- [ ] The text is coloured as gql-highlight colours it, and each line is read back in plain English beside it.
- [ ] Typing a misspelt name underlines it with a ⚠. Its fix is offered on that line, and pressing it fixes the text.
- [ ] Names, kinds and relationships already in the graph are suggested while typing. On the desktop, Tab takes the first.
- [ ] What is typed reaches the note within about a third of a second, and the drawing follows.
- [ ] Editing the same block in the note while typing in the pane: the pane reloads the block, says what was typed is
      kept as a draft, and Restore draft brings it back.
- [ ] Undo and Redo take back and put back each change in the note.
- [ ] Typing ( to start the next pattern on a new line adds the comma to the line before; typing ] after a link type
      written without its colon, such as -[favours, adds the colon and the type as the graph spells it, [:FAVOURS]. One
      undo takes either back. Both work in the pane, in place and in the note itself.
- [ ] In the note itself, with Obsidian's "Auto pair brackets" on (Settings → Editor), and again with it off: the comma
      comes when ( is typed, and the colon when ] is typed or stepped over.
- [ ] Completing as you type, in the pane and in the card: typing { shows a faint } after the caret, and the text after
      it does not move. Tab writes it with the caret left inside; Escape puts it away until the next typing; one undo
      takes back what Tab wrote. Typing the closer yourself where one is already there steps over it (and a stepped-over
      ] still gets its colon), and one undo goes back to the text as it was on screen. Likewise a keyword (MA), a kind
      after (z:, a type after -[:, a property name after {, and a value already used after name: '; these Enter takes
      too, but Enter never takes a closer, and with nothing to take it is a new line. After a bare ( the names are
      suggested and Tab takes the first, as before. On the phone, Enter on the keyboard takes a word (there is no Tab);
      confirm that the Enter ending an IME composition (e.g. Japanese keyboard) takes nothing.
- [ ] A thing given text but no name, such as `(:Option {name: 'Large reader'})`, is drawn, and shows a ⚠ naming the
      suggested name, in the style of the names already in the graph and not one of them. Its fix puts the name after the
      (, and the ⚠ goes. A thing given a name but no text, such as `(large_reader:Option)`, shows an ℹ hint, not counted
      on the badge, with the text suggested from the name; its fix adds `{name: 'Large reader'}`. Nothing is written
      until the fix is pressed.
- [ ] A graph locked by an earlier build shows a ⚠ that its schema does not declare its types; its fix adds the
      DECLARES links, and the ⚠ goes.
- [ ] A link type left without its colon is drawn as that type, with a ⚠ whose fix writes the colon. A new type written
      without its colon is an error that says to write it.
- [ ] A draft graph offers Lock the graph. Locking writes its schema as a new block after the graph.
- [ ] Lock a graph built over two blocks, from its first block: the schema declares every kind and relationship of
      both blocks, and the graph then shows no problems.
- [ ] Phone: the pane offers Drawing and Text as two tabs, with problems in a sheet at the bottom. Every button is easy
      to hit with a thumb, and nothing needs a hover.

## Editing in place and the inspector — spec §4, §14

- [ ] Edit here opens the text inside the drawing's card, and typing there redraws the drawing without losing the place.
- [ ] Straight after the app starts or reloads, and on a card far down a long note scrolled to only then: Edit here
      opens the editor in that card, and Done closes it with what was typed in the note. Edit here never does nothing
      without saying why.
- [ ] In the card, the text box is as tall as the text and one more line: no empty area below it for the caret to land
      in. Each read-back sits on its own line's right, never wrapping under it, and typing lands where the text shows.
      iPhone ✓ 5cfeac6, 8 Oct 2026.
- [x] Live Preview: typing in a card, with the card's top above the view or the note scrolled to its end, never moves
      the page: the box stays where it is on screen, and the note's other text with it. Mac ✓ 0.3.0, iPhone ✓ 0.3.0, 9 Oct 2026.
- [ ] Typing in the card, character by character, redraws the drawing and never takes the focus from the box: the caret,
      the selection and where it is scrolled stay put. Typing a comma at a line's end keeps the box in its card.
      Undo (⌘Z, or Edit → Undo, or the phone's undo gesture) takes back a run of typing at a time, even after redraws.
      Mac ✓ 3d34e0d, reading view, 9 Oct 2026 (traced in the app); Live Preview and the phone to come.
- [x] Desktop: hovering the mouse over the box in the card, and clicking into it, never turns it grey or hides its
      coloured text, and no tooltip appears over it. Mac ✓ d601110, 8 Oct 2026.
- [ ] While the card is being edited, its pencil shows as a book (view) icon. Pressing it writes what was typed and
      closes the box, as Done does, and the pencil comes back. Mac ✓ d601110, 8 Oct 2026.
- [x] In edit mode, tapping a box or a link shows its properties, looking as a note's Properties panel looks in this
      theme: the same rows, icons, spacing, type and colours, in both the light and dark themes.
      Mac ✓ 0.3.0, iPhone ✓ 0.3.0, 9 Oct 2026.
- [ ] A number has a number field, a date opens the date picker, and true or false is a checkbox.
- [ ] A value is written when its field is left; a value that does not fit its type says why, and nothing changes.
- [ ] Tapping a property's icon opens a menu to change its type or remove it. Add property adds a row in place, its
      name suggested from the names already used.
- [ ] A text property with several values (`tags: 'quiet, cheap'`): the icon's menu lists List after Text. Choosing it
      shows two fields, a kind and a relationship, filled in from the property's name and offering the kinds and
      relationships the graph already uses; Make list turns each value into a thing of that kind, linked from this one,
      and the property row becomes a row of chips. Cancel puts the field back. Undo (⌘Z, or the phone's gesture) takes
      the whole change back in one step. A thing with the same name that already exists is linked, not written again.
- [ ] A list's chips look as a note's list property looks in the Properties panel in this theme, light and dark. The x
      on a chip removes it: the link goes, and the thing too when nothing else links to it, and a line under the rows
      says which. The add field adds a value on Enter, or when it is left; an empty value, or one already there, says
      why and writes nothing. Phone: the chips, their x and the add field are easy to hit in the sheet, and the keyboard
      does not cover the field being typed in.
- [ ] While editing, in the card or the pane, choosing a box selects the pattern that writes it in the text, and
      choosing a link selects its brackets and arrow (slice 2).
- [ ] Phone: the properties open as a sheet at the bottom of the screen, and every field and icon is easy to hit.

## Accessibility — spec §8, §11

- [ ] Desktop, keyboard only: Tab reaches every button, the drawing, each box and each estimated link. Enter opens a
      box's details or an estimate's reason.
- [ ] With VoiceOver: the drawing is described as a list of sentences, and a new problem typed in the pane is announced
      without the focus moving.

## Result

Build: ____ · Device: ____ · Obsidian version: ____ · Date: ____ · By: ____

Failures, each with what was seen:
