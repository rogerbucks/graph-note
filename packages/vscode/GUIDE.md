# The VS Code extension: where things live

The VS Code extension (spec §41, `vscode_plugin`) draws and edits the graph blocks of a Markdown note in a VS Code tab.
Choose **Open in ThoughtKnot** on a Markdown note: from the editor's title bar, the Explorer's right-click menu or the
Command Palette. The tab opens beside the note.

The tab is a webview running the browser editor's page, the same page the browser and the desktop app run. So it draws
and edits through the shared display layer, and nothing is ported. It works offline.

## How it fits together

```
VS Code (Node)
  extension.ts               Open in ThoughtKnot, one tab per note
    folder-calls.ts          answers the page's folder calls, each checked by place.ts
      vscodeDisk             VS Code's file system, or the open text editor's copy of the note
tab (webview)
  index.html                 the browser editor's page (packages/claude-code/page), made ready by webview-html.ts
    vscode-editor.js         answers the page's /api/ calls: the desktop app's appFetch (packages/app/src/app-api.ts)
      core storage           workspaceStorage (packages/core/src/workspace-storage.ts)
        tauriFiles           the desktop app's folder calls, sent to the extension by message
```

## The source, `src/`

- `extension.ts`: `activate` adds the commands: Open in ThoughtKnot here, and Ask AI (below). A tab is opened for the note in the active editor, or the one clicked.
  - The folder is the note's workspace folder, or the note's own folder outside one. A note's id is its path there.
  - A note in a hidden folder, such as `.git`, is never opened.
  - A note open in a text editor is read from there, unsaved typing too. An edit goes in as a change to that text, and
    is then saved, so VS Code's undo and the text editor stay true. Any other file is read and written on disk.
  - The extension's messages, and the page, are in VS Code's display language (`vscode.env.language`).
- `folder-calls.ts`: the six calls the page may make: `read_text`, `write_text`, `remove_file`, `read_dir`, `make_dir`
  and `write_new`. These are the desktop app's folder commands, less its folder picker. Any other call is refused.
- `place.ts`: the desktop app's path rules, as `place.rs` keeps them. A path never climbs out, never starts at a root,
  never names a hidden part and never passes through a link. A link is also left out of a folder's list.
- `webview-html.ts`: the page for a webview. Each file is named by its webview address. The settings go in a JSON
  block. The content policy allows only the extension's own files, and scripts carrying the page's one-time number.
- `vscode-disk.ts`: the note's folder on VS Code's file system, and which note a command is for.
- `vscode-editor.ts`: runs in the tab before the page.
  - It sends the folder calls to the extension by message, and puts in the desktop app's `appFetch`.
  - It opens the page on the note.
  - It makes the page read VS Code's language as the browser's.
  - A webview's workers must start from a `blob:`. Each one holds one line that loads the extension's own worker file.

The page's colours follow VS Code's theme: VS Code names it in the page's body classes, and the style sheet maps light,
dark and high contrast to ThoughtKnot's own colours.

## Asking AI, in VS Code

`ask-ai.ts` gives **Ask AI about this note** (`host_ai_first`). It offers VS Code's own language models, through
VS Code's language model API. So the models, sign-ins and consents you chose in VS Code apply. ThoughtKnot holds no key.

- AI stays off until you turn on **ThoughtKnot: AI Use** in the settings.
- You choose the model, the graph, what of it to send, and your question.
- A note above **ThoughtKnot: AI Ceiling** is never sent. A note holding a credential is never sent.
- The exact request opens beside the note. Only **Send**, chosen on exactly that, sends it, once.
- The answer goes into the note as a proposal. You accept or reject it in the tab.
- Each send is recorded in VS Code's store for the extension: the last 200, never the text sent.

## What the tab does not do yet

- The AI models set up in ThoughtKnot's own settings, by address and key, are not offered in VS Code. VS Code's own are.
- Earlier versions and GitHub reviews are refused in words, as in the desktop app.
- Plug-ins do not run in the tab.

## Build and test

```
npm run build --workspace packages/vscode     # into packages/vscode/dist
npm run test:ai -- test/vscode-plugin.test.js packages/vscode/test/ask-ai.test.js
```

`test/vscode-plugin.test.js` builds the extension and loads it against a stand-in for VS Code's API over a real folder
(`test/fake-vscode.js`). It runs the tab's page in a real Chrome, carrying VS Code's messages both ways. The page draws
the note, writes an edit to disk and loads only its own files. The test also runs the storage contract through the
tab's calls. `test/host-adapters.test.js` runs the host contract in the tab's page.

`test/ask-ai.test.js` asks a stand-in language model, with the person's answers scripted in turn.

To try it in VS Code itself, build it and open this folder in VS Code. Then run **Debug: Start Debugging** with an
extension host, or package it with `npx @vscode/vsce package` and install the `.vsix`.
