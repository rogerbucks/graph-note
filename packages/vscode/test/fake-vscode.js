// A stand-in for the part of VS Code's API the extension uses, over a real folder on disk (spec §41, vscode_plugin).
// Test code only. Its file system is Node's, so a link is seen as a link, as VS Code's own sees it. Its webview hands
// what the page posts to the extension, and what the extension posts back to `toPage`, which a test points at a page.
// `loadExtension` loads the built extension.cjs against it, as VS Code loads it.
import { promises as fs, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, posix } from 'node:path';

const require = createRequire(import.meta.url);

/** VS Code's file types, as bits. */
export const FileType = { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 };

/** A file address, as VS Code's `Uri` for the `file` scheme. */
export class Uri {
  constructor(path) {
    this.scheme = 'file';
    this.path = posix.normalize(path);
    this.fsPath = this.path;
  }
  static file(path) {
    return new Uri(path);
  }
  static joinPath(uri, ...parts) {
    return new Uri(posix.join(uri.path, ...parts));
  }
  toString() {
    return `file://${this.path}`;
  }
}

/** VS Code's file system error, with its code. */
export class FileSystemError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/**
 * A stand-in VS Code: `language` is its display language, `folders` its workspace folders' paths. A webview names a file
 * under `served` by its path from there, at `origin`, so a test serves that folder there.
 */
export function fakeVscode({ language = 'en', folders = [], origin = 'http://webview.invalid', served = '/' } = {}) {
  const commands = new Map();
  const said = [];
  const tabs = [];
  const asError = (e) => (e?.code === 'ENOENT' ? new FileSystemError(e.message, 'FileNotFound') : e);
  const typeOf = async (path) => {
    const link = await fs.lstat(path);
    if (!link.isSymbolicLink()) return link.isDirectory() ? FileType.Directory : FileType.File;
    const target = await fs.stat(path).catch(() => null);
    return FileType.SymbolicLink | (target?.isDirectory() ? FileType.Directory : FileType.File);
  };
  const guarded =
    (run) =>
    async (...args) => {
      try {
        return await run(...args);
      } catch (e) {
        throw asError(e);
      }
    };

  const vscode = {
    Uri,
    FileType,
    FileSystemError,
    ViewColumn: { Beside: -2 },
    env: { language },
    commands: {
      registerCommand: (name, run) => (commands.set(name, run), { dispose: () => commands.delete(name) }),
      executeCommand: (name, ...args) => commands.get(name)(...args),
    },
    window: {
      activeTextEditor: undefined,
      showInformationMessage: async (text) => void said.push(text),
      showWarningMessage: async (text) => void said.push(text),
      createWebviewPanel: (viewType, title, column, options) => {
        const fromPage = [];
        const disposed = [];
        const tab = {
          viewType,
          title,
          options,
          toPage: () => undefined,
          webview: {
            html: '',
            cspSource: origin,
            asWebviewUri: (uri) => ({ toString: () => `${origin}/${posix.relative(served, uri.path)}` }),
            postMessage: async (message) => (tab.toPage(message), true),
            onDidReceiveMessage: (run) => (fromPage.push(run), { dispose() {} }),
          },
          /** Hands `message` to the extension, as the page's `postMessage` does; resolves once it is answered. */
          fromPage: (message) => Promise.all(fromPage.map((run) => run(message))),
          reveal: () => (tab.revealed = (tab.revealed ?? 0) + 1),
          onDidDispose: (run) => (disposed.push(run), { dispose() {} }),
          dispose: () => disposed.forEach((run) => run()),
        };
        tabs.push(tab);
        return tab;
      },
    },
    workspace: {
      textDocuments: [],
      getWorkspaceFolder: (uri) => {
        const folder = folders.find((f) => uri.path.startsWith(`${f}/`));
        return folder ? { uri: Uri.file(folder) } : undefined;
      },
      fs: {
        readFile: guarded(async (uri) => new Uint8Array(await fs.readFile(uri.fsPath))),
        writeFile: guarded((uri, bytes) => fs.writeFile(uri.fsPath, bytes)),
        delete: guarded((uri) => fs.rm(uri.fsPath)),
        readDirectory: guarded(async (uri) =>
          Promise.all((await fs.readdir(uri.fsPath)).map(async (name) => [name, await typeOf(join(uri.fsPath, name))])),
        ),
        createDirectory: guarded((uri) => fs.mkdir(uri.fsPath, { recursive: true })),
        stat: guarded(async (uri) => ({ type: await typeOf(uri.fsPath) })),
      },
    },
  };
  return { vscode, commands, said, tabs };
}

/** The built extension at `file`, loaded with `vscode` as its `vscode` module. */
export function loadExtension(file, vscode) {
  const Module = require('node:module');
  const m = new Module(file);
  m.filename = file;
  m.paths = Module._nodeModulePaths(posix.dirname(file));
  const real = Module._load;
  Module._load = (request, ...rest) => (request === 'vscode' ? vscode : real(request, ...rest));
  try {
    m._compile(readFileSync(file, 'utf8'), file);
  } finally {
    Module._load = real;
  }
  return m.exports;
}
