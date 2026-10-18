# Z-09 Reading view read only

**You should see:** in reading view, a bar that offers Source and no Edit. Source swaps the drawing for the block's text, coloured, in the same place, and pressing it again brings the drawing back. A hover preview of this note, or an embed of it in another, is read-only in the same way, and an embed stays read-only even when the note it is embedded in is open in Live Preview: Source, and no Edit here or Edit in pane. Properties can be seen but never added or changed in reading view: tapping Large reader shows "name: Large reader" and "weight: 180" under Properties, and tapping its ANSWERS link shows "since: 2024", each as plain words. Nothing there can be typed in or pressed to change them: no Add property, no type icon or its menu (no Text, List or Remove), no value or name field, no x on a list's things and no field to add one, no Park for later, no Add the name for Pocket reader, written without a name on purpose (its one problem on the badge), no Record a path, no Make a view. The only button in the details is Close. The view of the answers below the graph shows its reading in words, with no Fade others or Hide others and no Save as shown. All of this holds while the same block is being edited in place in Live Preview in another pane, and in full screen opened from reading view, which offers no Edit here and no Edit in pane either. A ThoughtKnot pane opened on the block before, from Live Preview, is not reading view: it keeps saving what you type, and the reading view pane shows it.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader', weight: 180}),
(small:Option {name: 'Small reader'}),
(large)-[:ANSWERS {since: 2024}]->(question),
(small)-[:ANSWERS]->(question),
(light:Tag {name: 'Light'}),
(large)-[:HAS_TAG]->(light),
(cheap:Tag {name: 'Cheap'}),
(large)-[:HAS_TAG]->(cheap),
(:Option {name: 'Pocket reader'})
```

```gql
// graph: reader · QUERY view answers
MATCH (n {id: 'question'})-[]-{1,1}(m) RETURN n, m
```

<!-- expect: problem "this thing has no name; suggested: pocket_reader" -->

**Do this:**

0. Open this note in reading view (not Live Preview): reading view is the one that hides the Edit button.
1. Switch to reading view and look at the bar: Source, and no Edit.
2. Press Source, then press it again.
3. Hover over a link to this note, or embed it in another note with `![[Z-09 Reading view read only]]`, and check the drawing there has no Edit, with that other note in reading view and again in Live Preview.
4. Tap Large reader. Check its properties are listed, and that nothing in its details can be typed in, pressed or right-clicked to change them: no Add property, no type icon, no field, no x on Light or Cheap, no Park for later.
5. Tap the link from Large reader to the question. Check "since: 2024" is listed, with nothing to change it.
6. Tap Pocket reader. Its suggested name is said, with no button to add it.
7. With a box selected, press Enter, Space, Delete and Command-Z (Ctrl-Z on Windows): nothing in the note changes.
8. Open the note in a second pane in Live Preview and press Edit here on its drawing. Back in the reading view pane, repeat steps 4 to 7, and check there is no Record a path and no Make a view. The text being edited in Live Preview must not change, and its selection must not move when you tap a box in reading view.
9. Press Full screen in reading view. Check there is no Edit here and no Edit in pane, and repeat step 4 there.
10. On the view of the answers, check there is no Fade others, Hide others or Save as shown, on the card and in its full screen.
11. In a Live Preview pane, open the ThoughtKnot pane on the graph, then switch the other pane to reading view. Type a new thing in the ThoughtKnot pane: it is saved, and the reading view pane draws it. Undo to take it back.

**Checklist line:**

> **Z-09** Reading view is read-only: the bar offers Source and no Edit. Source shows the block's text, coloured, in place of the drawing. Pressed again, it brings the drawing back.
>
> - A hover preview or an embed is read-only too, an embed even inside a note in Live Preview.
> - Properties are shown but never added or changed: no Add property, no field, no type menu, no x or add field on a list.
> - There is no Park for later, and no fix that writes a suggested name. There is no Record a path or Make a view, and no Fade or Hide others or Save as shown.
> - There is no Edit here or Edit in pane, even while the block is edited in Live Preview. The same holds in full screen opened from reading view.
> - A ThoughtKnot pane already open on the block keeps saving while another pane shows the note in reading view.

**Back to the checklist:** [Z-09 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for Z-09 in its list.
