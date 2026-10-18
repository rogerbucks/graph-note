// Builds a page that shows the plugin drawing a sample note in an ordinary browser. It is for looking at it and trying
// the controls before it goes onto a device. Run: node packages/obsidian/harness/build.mjs <folder>
import esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutWorker } from '../esbuild.config.mjs';

const here = dirname(fileURLToPath(import.meta.url)),
  out = process.argv[2];
if (!out) throw new Error('give the folder to build the page into');
mkdirSync(out, { recursive: true });
await esbuild.build({
  entryPoints: [join(here, 'harness.js')],
  outfile: join(out, 'harness.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  alias: { obsidian: join(here, 'obsidian-shim.js') },
  loader: { '.md': 'text' },
  // the layout worker's own bundle, made as the plugin's build makes it (spec §9, layout_contained)
  plugins: [layoutWorker],
  logLevel: 'warning',
});
copyFileSync(join(here, '..', '..', '..', 'styles.css'), join(out, 'styles.css'));
copyFileSync(join(here, 'index.html'), join(out, 'index.html'));
