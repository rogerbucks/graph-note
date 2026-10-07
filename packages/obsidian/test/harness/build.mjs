// Builds a page that shows the plugin drawing a sample note in an ordinary browser, for looking at it and trying the
// controls before it goes onto a device: node packages/obsidian/test/harness/build.mjs <folder>
import esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), out = process.argv[2];
if (!out) throw new Error('give the folder to build the page into');
mkdirSync(out, { recursive: true });
await esbuild.build({
  entryPoints: [join(here, 'harness.js')], outfile: join(out, 'harness.js'), bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
  alias: { obsidian: join(here, 'obsidian-shim.js') }, loader: { '.md': 'text' }, logLevel: 'warning',
});
copyFileSync(join(here, '..', '..', '..', '..', 'styles.css'), join(out, 'styles.css'));
copyFileSync(join(here, 'index.html'), join(out, 'index.html'));
