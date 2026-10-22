// Builds the browser editor's page into one folder (spec §26). These are the files the server holds and serves from its
// own origin. Nothing is fetched from anywhere.
// - `page.js` is the page.
// - `layout-worker.js` is the worker the core's layout runs in, with the Graphviz engine inside it.
// - `page.css` holds the theme (theme-css.ts) and the display layer's styles. Those are the plugin's styles.css, which
//   reads the same design tokens. It also holds the page's own styles with the tokens' mapping, and one rule per icon
//   file.
// - `plugin-start.txt` is the start of each plug-in worker's script, which seals the worker (page-plugins.ts).
// - `index.html` and the `icons/` folder are copied.
// esbuild.config.mjs uses it to put them in the mod. The page's tests use it too.
import esbuild from 'esbuild';
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { themeCss } from './page/theme-css.ts';
import { PLUGIN_START } from './server/page-assets.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** One rule for each icon file: the variable the `gn-icon` class paints with. */
function iconRules(names) {
  return names.map((n) => `.gn-icon-${n}{--gn-icon-image:url('/icons/${n}.svg')}`).join('\n');
}

/** The page's style sheet: theme, shared styles, the page's, the icons'. */
export function pageCss(iconNames) {
  const shared = readFileSync(join(here, '../../styles.css'), 'utf8');
  const own = readFileSync(join(here, 'page/page.css'), 'utf8');
  return [themeCss(), shared, own, iconRules(iconNames)].join('\n');
}

/** Builds the page's files into `out`; returns the esbuild metafiles, for what went into each bundle. */
export async function buildPage(out) {
  mkdirSync(join(out, 'icons'), { recursive: true });
  const common = {
    absWorkingDir: here,
    bundle: true,
    platform: 'browser',
    target: 'es2022',
    logLevel: 'warning',
    metafile: true,
  };
  // the shared layer takes some values from the core's entry, which also names the Graphviz engine. The page never
  // carries that engine (the worker does). So for the page alone, the engine's module is an empty stand-in that refuses
  // to start
  const noEngine = {
    name: 'no-engine-on-the-page',
    setup(build) {
      build.onResolve({ filter: /(^|\/)engine\.ts$/ }, (args) =>
        args.resolveDir.endsWith('/core/src') ? { path: 'engine', namespace: 'no-engine' } : undefined,
      );
      build.onLoad({ filter: /.*/, namespace: 'no-engine' }, () => ({
        contents: "export const loadEngine = () => Promise.reject(new Error('The page carries no layout engine.'));",
        loader: 'js',
      }));
    },
  };
  const page = await esbuild.build({
    ...common,
    plugins: [noEngine],
    entryPoints: ['page/page-main.ts'],
    outfile: join(out, 'page.js'),
    format: 'esm',
    legalComments: 'inline',
  });
  const worker = await esbuild.build({
    ...common,
    entryPoints: ['page/layout-worker-entry.ts'],
    outfile: join(out, 'layout-worker.js'),
    format: 'iife',
    legalComments: 'inline',
  });
  // the start of each plug-in worker's script: one function, run on `self`, that seals it (page/plugin-worker-entry.ts).
  // It is text, not a page file, so the server reads it by name and serves it only before a plug-in turned on
  const start = await esbuild.build({
    ...common,
    entryPoints: ['page/plugin-worker-entry.ts'],
    format: 'iife',
    globalName: 'thoughtknotPluginWorker',
    legalComments: 'inline',
    write: false,
  });
  writeFileSync(
    join(out, PLUGIN_START),
    `function (scope) {\n${start.outputFiles[0].text}\nreturn thoughtknotPluginWorker.serve;\n}`,
  );
  cpSync(join(here, 'page/icons'), join(out, 'icons'), { recursive: true });
  const icons = readdirSync(join(here, 'page/icons'))
    .filter((f) => f.endsWith('.svg'))
    .map((f) => f.slice(0, -4));
  writeFileSync(join(out, 'page.css'), pageCss(icons));
  // the page itself last: a server takes a folder holding index.html for a built one, so it comes once the rest is
  // written
  cpSync(join(here, 'page/index.html'), join(out, 'index.html'));
  return { page: page.metafile, worker: worker.metafile };
}
