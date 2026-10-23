// The tab's page (spec §41, vscode_plugin). It is the browser editor's page, built as the Claude Code host builds it.
// Here it is made ready for a VS Code webview. A webview serves no files from its own address, so:
// - every file of the page is named by its webview address, under `base`;
// - `vscode-editor.js` runs first, as a plain script, and answers the page's calls (vscode-editor.ts);
// - the page's settings travel in a script block of JSON, never as code;
// - the content policy allows only the extension's own files and scripts carrying this page's one-time number. Workers
//   start from a `blob:` that loads the extension's own worker file, as a webview must (vscode-editor.ts).
// So the page itself runs unchanged.

/** What the page is opened with: where its files are, the note, and the language VS Code shows itself in. */
export interface WebviewSettings {
  /** The webview address of the built page's folder, with no slash at its end. */
  base: string;
  /** The note's path in its folder. */
  note: string;
  /** VS Code's display language, as a language tag (`vscode.env.language`). */
  language: string;
}

/** The content policy: the extension's own files, the scripts carrying `nonce`, and workers from a `blob:`. */
export function contentPolicy(cspSource: string, nonce: string): string {
  return [
    "default-src 'none'",
    `img-src ${cspSource} data: blob:`,
    // the drawing and the shared styles set some styles on the element itself
    `style-src ${cspSource} 'unsafe-inline'`,
    `font-src ${cspSource}`,
    // the worker's blob loads the worker file by its webview address; the layout engine inside it is WebAssembly
    `script-src 'nonce-${nonce}' ${cspSource} 'wasm-unsafe-eval'`,
    'worker-src blob:',
  ].join('; ');
}

/** `text` safe inside a `<script>` block: no `<` can end it. */
const scriptSafe = (text: string) => text.replace(/</g, '\\u003c');

/** `text` safe inside a double-quoted attribute. */
const attribute = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The webview's page, from the built page's `index.html`. */
export function webviewHtml(page: string, settings: WebviewSettings, cspSource: string, nonce: string): string {
  const { base } = settings;
  const head = [
    `<meta http-equiv="Content-Security-Policy" content="${attribute(contentPolicy(cspSource, nonce))}" />`,
    `<script id="thoughtknot-vscode" type="application/json" nonce="${nonce}">${scriptSafe(JSON.stringify(settings))}</script>`,
    `<script nonce="${nonce}" src="${attribute(base)}/vscode-editor.js"></script>`,
  ].join('\n    ');
  return page
    .replace(/<html lang="[^"]*"/, `<html lang="${attribute(settings.language)}"`)
    .replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    ${head}`)
    .replace('href="/page.css"', `href="${attribute(base)}/page.css"`)
    .replace(
      '<script type="module" src="/page.js"></script>',
      `<script type="module" nonce="${nonce}" src="${attribute(base)}/page.js"></script>`,
    );
}
