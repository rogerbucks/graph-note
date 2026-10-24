// The VS Code extension (spec §41, vscode_plugin). Open in ThoughtKnot, on a Markdown note, opens a tab beside it. The
// tab is a webview running the browser editor's page, the one the browser and the desktop app run. So it draws and
// edits the note's graph blocks through the shared display layer.
// - The page reaches the note's folder only by message: the desktop app's folder commands, each checked here
//   (folder-calls.ts, place.ts). The folder is the note's workspace folder, or the note's own folder outside one.
// - A note open in a text editor is read from there, unsaved typing too. An edit goes in as a change to that text, then
//   is saved. So VS Code's undo, and the editor's view of the note, stay true.
// - The extension's own messages, and the page, are in VS Code's display language (language_follows_host).
// One tab per note: choosing it again shows the tab already open.
import * as vscode from 'vscode';
import { setLanguage, word } from '../../core/src/words.ts';
import { askAi } from './ask-ai.ts';
import { folderCalls, isFolderCall } from './folder-calls.ts';
import { placeProblem } from './place.ts';
import { webviewHtml } from './webview-html.ts';
import { noteOf, placeOf, vscodeDisk } from './vscode-disk.ts';

export { vscodeDisk } from './vscode-disk.ts';

/** The tab open for each note, by its address. */
const tabs = new Map<string, vscode.WebviewPanel>();

/** A fresh one-time number for the page's scripts. */
const nonce = () =>
  [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Opens `given`, or the note in the active editor, in a tab beside it. */
async function openGraph(context: vscode.ExtensionContext, given?: unknown): Promise<void> {
  setLanguage(vscode.env.language);
  const uri = noteOf(given);
  if (!uri) return;
  const already = tabs.get(uri.toString());
  if (already) return already.reveal();
  const { folder, note } = placeOf(uri);
  if (placeProblem(note)) {
    void vscode.window.showWarningMessage(word('vscode.hidden-note'));
    return;
  }
  const pageFolder = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
  const tab = vscode.window.createWebviewPanel(
    'thoughtknot.graph',
    word('vscode.tab', { note: note.slice(note.lastIndexOf('/') + 1) }),
    vscode.ViewColumn.Beside,
    { enableScripts: true, localResourceRoots: [pageFolder], retainContextWhenHidden: true },
  );
  tabs.set(uri.toString(), tab);
  const answer = folderCalls(vscodeDisk(folder));
  tab.webview.onDidReceiveMessage(
    async (message: unknown) => {
      if (isFolderCall(message)) await tab.webview.postMessage(await answer(message));
    },
    undefined,
    context.subscriptions,
  );
  tab.onDidDispose(() => tabs.delete(uri.toString()), undefined, context.subscriptions);
  const page = new TextDecoder().decode(
    await vscode.workspace.fs.readFile(vscode.Uri.joinPath(pageFolder, 'index.html')),
  );
  const base = tab.webview.asWebviewUri(pageFolder).toString().replace(/\/$/, '');
  tab.webview.html = webviewHtml(page, { base, note, language: vscode.env.language }, tab.webview.cspSource, nonce());
}

/** Called by VS Code the first time one of the extension's commands is chosen. */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('thoughtknot.openGraph', (given?: unknown) => openGraph(context, given)),
    vscode.commands.registerCommand('thoughtknot.askAi', (given?: unknown) => askAi(context, given)),
  );
}

/** Called by VS Code as it stops the extension: each tab is closed with it. */
export function deactivate(): void {
  for (const tab of tabs.values()) tab.dispose();
  tabs.clear();
}
