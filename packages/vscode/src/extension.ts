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
import { folderCalls, isFolderCall, type FolderDisk } from './folder-calls.ts';
import { placeProblem } from './place.ts';
import { webviewHtml } from './webview-html.ts';

/** The tab open for each note, by its address. */
const tabs = new Map<string, vscode.WebviewPanel>();

/** VS Code's word for "no file there", as the core and folder-calls.ts read it. */
const asNotThere = (e: unknown): unknown =>
  e instanceof vscode.FileSystemError && e.code === 'FileNotFound'
    ? Object.assign(new Error(e.message), { code: 'ENOENT' })
    : e;

/** The text editor's copy of the file at `uri`, when one is open. */
const openCopy = (uri: vscode.Uri) => vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());

/** The folder at `root`, through VS Code's file system, as folder-calls.ts asks it. */
export function vscodeDisk(root: vscode.Uri): FolderDisk {
  const fs = vscode.workspace.fs;
  const at = (path: string) => (path ? vscode.Uri.joinPath(root, ...path.split('/')) : root);
  const call = async <T>(run: () => PromiseLike<T>): Promise<T> => {
    try {
      return await run();
    } catch (e) {
      throw asNotThere(e);
    }
  };
  return {
    readText: async (path) => {
      const open = openCopy(at(path));
      if (open) return open.getText();
      // the byte order mark is kept, as the core's workspace storage asks
      return new TextDecoder('utf-8', { ignoreBOM: true }).decode(await call(() => fs.readFile(at(path))));
    },
    writeText: async (path, text) => {
      const open = openCopy(at(path));
      if (!open) return call(() => fs.writeFile(at(path), new TextEncoder().encode(text)));
      const edit = new vscode.WorkspaceEdit();
      edit.replace(open.uri, new vscode.Range(open.positionAt(0), open.positionAt(open.getText().length)), text);
      if (!(await vscode.workspace.applyEdit(edit)) || !(await open.save())) throw new Error(word('server.no-answer'));
    },
    writeBytes: (path, bytes) => call(() => fs.writeFile(at(path), bytes)),
    delete: (path) => call(() => fs.delete(at(path))),
    readDirectory: (path) => call(() => fs.readDirectory(at(path))),
    createDirectory: (path) => call(() => fs.createDirectory(at(path))),
    typeOf: async (path) => {
      try {
        return (await fs.stat(at(path))).type;
      } catch (e) {
        if (asNotThere(e) !== e) return null;
        throw e;
      }
    },
  };
}

/** A fresh one-time number for the page's scripts. */
const nonce = () =>
  [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** The note's folder and its path there: its workspace folder, or its own folder outside one. */
function placeOf(uri: vscode.Uri): { folder: vscode.Uri; note: string } {
  const folder = vscode.workspace.getWorkspaceFolder(uri)?.uri ?? vscode.Uri.joinPath(uri, '..');
  return { folder, note: uri.path.slice(folder.path.replace(/\/$/, '').length + 1) };
}

/** Opens `given`, or the note in the active editor, in a tab beside it. */
async function openGraph(context: vscode.ExtensionContext, given?: unknown): Promise<void> {
  setLanguage(vscode.env.language);
  const uri = given instanceof vscode.Uri ? given : vscode.window.activeTextEditor?.document.uri;
  if (!uri || !/\.md$/i.test(uri.path)) {
    void vscode.window.showInformationMessage(word('vscode.open-a-note'));
    return;
  }
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

/** Called by VS Code the first time Open in ThoughtKnot is chosen. */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('thoughtknot.openGraph', (given?: unknown) => openGraph(context, given)),
  );
}

/** Called by VS Code as it stops the extension: each tab is closed with it. */
export function deactivate(): void {
  for (const tab of tabs.values()) tab.dispose();
  tabs.clear();
}
