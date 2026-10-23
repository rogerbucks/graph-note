// Builds the VS Code extension into dist/ (spec §41, vscode_plugin):
// - `extension.cjs`, the extension itself, for VS Code's Node, with `vscode` left for VS Code to give;
// - `webview/`, the tab's page: the browser editor's page, built as the Claude Code host builds it (esbuild.page.mjs);
// - `webview/vscode-editor.js` beside it, which answers the page's calls by message (src/vscode-editor.ts).
// A webview serves nothing from its own address, so the page's style sheet names its icons by a path from itself. Its
// colours follow VS Code's theme, which VS Code names in the page's body classes.
import esbuild from 'esbuild';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPage } from '../claude-code/esbuild.page.mjs';
import { schemeCss } from '../claude-code/page/theme-css.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** The page's style sheet for a webview: icons from beside it, and VS Code's light, dark and high contrast themes. */
export const webviewCss = (css) =>
  [
    css.replaceAll("url('/icons/", "url('icons/"),
    schemeCss('body.vscode-light', 'light'),
    schemeCss('body.vscode-dark,body.vscode-high-contrast:not(.vscode-high-contrast-light)', 'dark'),
    schemeCss('body.vscode-high-contrast-light', 'light'),
  ].join('\n');

/** Builds the extension into `out`. */
export async function buildExtension(out = join(here, 'dist')) {
  rmSync(out, { recursive: true, force: true });
  const page = join(out, 'webview');
  await buildPage(page);
  writeFileSync(join(page, 'page.css'), webviewCss(readFileSync(join(page, 'page.css'), 'utf8')));
  const common = { absWorkingDir: here, bundle: true, target: 'es2022', logLevel: 'warning', legalComments: 'inline' };
  await esbuild.build({
    ...common,
    platform: 'browser',
    format: 'iife',
    entryPoints: ['src/vscode-editor.ts'],
    outfile: join(page, 'vscode-editor.js'),
  });
  await esbuild.build({
    ...common,
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
    entryPoints: ['src/extension.ts'],
    outfile: join(out, 'extension.cjs'),
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await buildExtension();
