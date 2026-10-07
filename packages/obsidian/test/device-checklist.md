# Device checklist — the graph note editor in Obsidian

The scripted check run by a person in Obsidian on a desktop and on a phone, for what the automated tests cannot see:
how it looks, how the gestures feel, and that it works offline on a real device. Run it on each slice's build, on the
desktop and on the phone, and note the build, the device, the date and anything that failed.

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
- [ ] A 50-thing graph is drawn in under half a second on the phone (§11).
- [ ] The drawing reads well in the light theme and in the dark theme.

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
- [ ] A draft graph offers Lock the graph. Locking writes its schema as a new block after the graph.
- [ ] Phone: the pane offers Drawing and Text as two tabs, with problems in a sheet at the bottom. Every button is easy
      to hit with a thumb, and nothing needs a hover.

## Editing in place and the inspector — spec §4, §14

- [ ] Edit here opens the text inside the drawing's card, and typing there redraws the drawing without losing the place.
- [ ] In edit mode, tapping a box or a link shows its properties, looking as a note's Properties panel looks in this
      theme: the same rows, icons, spacing, type and colours, in both the light and dark themes.
- [ ] A number has a number field, a date opens the date picker, and true or false is a checkbox.
- [ ] A value is written when its field is left; a value that does not fit its type says why, and nothing changes.
- [ ] Tapping a property's icon opens a menu to change its type or remove it. Add property adds a row in place, its
      name suggested from the names already used.
- [ ] Phone: the properties open as a sheet at the bottom of the screen, and every field and icon is easy to hit.

## Accessibility — spec §8, §11

- [ ] Desktop, keyboard only: Tab reaches every button, the drawing, each box and each estimated link. Enter opens a
      box's details or an estimate's reason.
- [ ] With VoiceOver: the drawing is described as a list of sentences, and a new problem typed in the pane is announced
      without the focus moving.

## Result

Build: ____ · Device: ____ · Obsidian version: ____ · Date: ____ · By: ____

Failures, each with what was seen:
