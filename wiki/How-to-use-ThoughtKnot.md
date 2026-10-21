# How to use ThoughtKnot

A short guide for everyone, with no technical knowledge needed. The pictures are taken from the latest version each
time it changes, so they show what you will see.

## What it does

You write a few lines in a note that say what things there are and how they are linked. ThoughtKnot turns them into a
drawing right inside the note. You can move around the drawing, change how it is laid out, and edit it, either by typing
or by working with the drawing itself.

<!-- wiki:shot card -->

## 1. Write your first graph

In any note, start a block with three backticks and the word `gql`, then list your things and their links:

````text
```gql
// graph: my-first-graph
(question:Question {title: 'Which laptop should I buy?'}),
(light:Option {name: 'The light one'}),
(fast:Option {name: 'The fast one'}),
(light)-[:ANSWERS]->(question),
(fast)-[:ANSWERS]->(question)
```
````

- A **thing** is written in round brackets: a short name, a colon, its kind, and what it says in curly brackets.
- A **link** joins two things with an arrow, and its kind goes in square brackets.
- Switch to reading view, or move your cursor out of the block, and the drawing appears.

You do not need to get it perfect. If something is wrong, ThoughtKnot says what, where, and how to fix it (see step 5).

Rather start from something? Write only the `// graph:` line, and press **Start from an example** on the empty drawing.
A small example is written for you, and a short tour shows what to do next. Skip it whenever you like. The command
**Show the tour** opens it again.

## 2. Move around the drawing

The buttons along the top of each drawing:

| Button | What it does |
|---|---|
| **Fit** | Shows the whole drawing at once |
| **Zoom out** and **Zoom in** | Make the drawing smaller or bigger. You can also pinch, or use the scroll wheel |
| **Find a thing** | Type part of a name to jump to it |
| **Filter by kind or link** | Show only some kinds of thing or link |
| **View** | Turn helpers on or off, such as labels that appear only when you zoom in |
| **Full screen** | Gives the drawing the whole window |

Tap any thing to see its details and the things linked to it.

<!-- wiki:shot find -->

<!-- wiki:shot filter -->

## 3. Change the layout

Press **Diagram type** (just above the drawing) to choose how it is laid out. It can be a network, a tree, a flow, a
circle around one thing, lanes, a timeline, or a table. ThoughtKnot suggests the type that suits your graph best, and explains why a
type cannot be used when it does not fit.

<!-- wiki:shot diagram-types -->

## 4. Edit the graph

There are two ways to edit:

- **Edit here** opens the text right under the drawing. Type, and the drawing updates as you go. Press **Done** when
  you are finished. **Lock the graph** stops anyone changing it by accident.
- **Edit in pane** opens the graph beside your note, so you can see both at once.

You can also add things with **Add a thing**, and every change can be undone.

<!-- wiki:shot edit-here -->

## 5. Fix problems

Sometimes something in a graph is not right, such as a link to a thing that does not exist. Then the button at the top
left of the drawing shows how many problems there are, instead of "No problems". Press it to see each one, with the line it is on
and the fix. The drawing still shows your best guess, marked with a warning sign and a dashed line, so you never lose
your work.

<!-- wiki:shot edit-in-pane -->

## 6. Share a picture

Press **Export** to save the drawing as an image. Choose what to export (for example the whole drawing), the format and a
light or dark theme, then press **Export it**.

<!-- wiki:shot export -->

## 7. Ask questions of a graph

A block that starts with `MATCH` asks a question of a graph instead of drawing one. For example: "which option has the
most reasons in its favour". It is shown as text. Press **Copy** to copy it, or **Edit** to change it.

## 8. Use AI, safely

ThoughtKnot can ask an AI model to suggest changes to a graph. It is **off until you turn it on**, and even then:

- nothing is sent until you press Send, and you see exactly what will be sent first;
- you choose which AI models it may use, and how sensitive a note each one may see;
- the AI only ever suggests: you accept or reject each change yourself.

To start, turn on **Use AI models** in the settings, add a model, then run the command **Ask an AI model to propose
changes**. The full details are in the
[privacy section of the README](https://github.com/rogerbucks/thoughtknot#privacy-and-network-use).

## Tips

- **Lost some typing?** Run the command **Recover kept drafts into a new note**. ThoughtKnot keeps a draft of every edit
  until it is saved into the note.
- **Sharing a note with other tools?** The command **Convert this note to standard GQL** rewrites the shortcuts Graph
  Note allows into the standard form other tools read.
- **Printing a note?** Each graph is printed whole, in light colours, with its legend. The buttons are left out.
- **On a phone,** tap where you would click, and pinch to zoom. Everything works offline.
- **Using only a keyboard?** Every button can be reached with Tab, and Escape closes whatever is open. Press ? on a
  drawing to see every keyboard shortcut. In Obsidian, give the drawing's commands keys of your own in Settings, Hotkeys.

## Settings

Find these in Obsidian under Settings, then Community plugins, then ThoughtKnot. This list is made from the plugin
itself, so it is always complete.

<!-- wiki:settings -->
