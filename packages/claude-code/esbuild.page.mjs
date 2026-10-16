// Builds the browser editor's page into one folder (spec §26): the files the server holds and serves from its own origin,
// and nothing fetched from anywhere. `page.js` is the page; `layout-worker.js` is the worker the core's layout runs in, with
// the Graphviz engine inside it; `page.css` is the theme (theme-css.ts), the display layer's styles (the plugin's
// styles.css, which names the same variables), the page's own and one rule for each icon file; `index.html` and the
// `icons/` folder are copied. Used by esbuild.config.mjs, which puts them in the mod, and by the page's tests.
import esbuild from 'esbuild';
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { themeCss } from './page/theme-css.ts';

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
  const page = await esbuild.build({
    ...common,
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
  cpSync(join(here, 'page/icons'), join(out, 'icons'), { recursive: true });
  cpSync(join(here, 'page/index.html'), join(out, 'index.html'));
  const icons = readdirSync(join(here, 'page/icons'))
    .filter((f) => f.endsWith('.svg'))
    .map((f) => f.slice(0, -4));
  writeFileSync(join(out, 'page.css'), pageCss(icons));
  return { page: page.metafile, worker: worker.metafile };
}
