// Bundles the plugin into main.js at the repository root, where the Obsidian
// plugin store expects it. Obsidian and CodeMirror come from the app at run
// time, so they are left out of the bundle.
import esbuild from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const options = {
  absWorkingDir: here,
  entryPoints: ['src/main.ts'],
  outfile: join(here, '..', '..', 'main.js'),
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  external: ['obsidian', '@codemirror/*', '@lezer/*'],
  legalComments: 'inline',
  sourcemap: false,
  minify: false,
  logLevel: 'info',
};

// --watch (npm run dev): rebuild on every save, for installing into a test vault.
if (process.argv.includes('--watch')) await (await esbuild.context(options)).watch();
else await esbuild.build(options);
