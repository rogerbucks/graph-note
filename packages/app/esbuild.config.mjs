// Builds the desktop app's window into dist/, which Tauri takes in whole (spec §41, standalone_app):
// - the browser editor's page, built as the Claude Code host builds it (esbuild.page.mjs), as `editor.html`;
// - `app-editor.js` before it, which answers the page's calls from the picked folder;
// - the app's first page, `index.html` with `app.js`, which picks the folder and lists its notes.
// Nothing is fetched from anywhere: the window's policy (src-tauri/tauri.conf.json) allows no other origin.
import esbuild from 'esbuild';
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPage } from '../claude-code/esbuild.page.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/** The editor's page, with the app's script loaded first: modules run in the order the page names them. */
export const editorHtml = (pageHtml) =>
  pageHtml.replace(
    '<script type="module" src="/page.js">',
    '<script type="module" src="/app-editor.js"></script>\n    $&',
  );

/** Builds the window's files into `out`. */
export async function buildApp(out = join(here, 'dist')) {
  rmSync(out, { recursive: true, force: true });
  await buildPage(out);
  renameSync(join(out, 'index.html'), join(out, 'editor.html'));
  writeFileSync(join(out, 'editor.html'), editorHtml(readFileSync(join(out, 'editor.html'), 'utf8')));
  await esbuild.build({
    absWorkingDir: here,
    bundle: true,
    platform: 'browser',
    target: 'es2022',
    format: 'esm',
    logLevel: 'warning',
    legalComments: 'inline',
    entryPoints: { app: 'src/app-start.ts', 'app-editor': 'src/app-editor.ts' },
    outdir: out,
  });
  writeFileSync(join(out, 'index.html'), readFileSync(join(here, 'index.html')));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await buildApp();
