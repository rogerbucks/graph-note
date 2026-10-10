// Spike: builds the browser view's page into out/, as the harness builds its own (packages/obsidian/harness/build.mjs):
// the plugin bundled against the shim of Obsidian, its layout worker inside, the plugin's styles and the harness's page.
import esbuild from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutWorker } from '../../packages/obsidian/esbuild.config.mjs';

const here = dirname(fileURLToPath(import.meta.url)),
  harness = join(here, '../../packages/obsidian/harness'),
  out = join(here, 'out');
mkdirSync(out, { recursive: true });
await esbuild.build({
  entryPoints: [join(here, 'page.js')],
  outfile: join(out, 'page.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  alias: { obsidian: join(here, 'obsidian-shim.js') },
  plugins: [layoutWorker],
  logLevel: 'warning',
});
copyFileSync(join(here, '../../styles.css'), join(out, 'styles.css'));
writeFileSync(
  join(out, 'index.html'),
  readFileSync(join(harness, 'index.html'), 'utf8')
    .replace('<title>Graph Note harness</title>', '<title>Graph note</title>')
    .replace('src="harness.js"', 'src="page.js"'),
);
