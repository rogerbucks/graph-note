// Bundles the plugin into main.js at the repository root, where the Obsidian
// plugin store expects it. Obsidian and CodeMirror come from the app at run
// time, so they are left out of the bundle.
import esbuild from 'esbuild';
import { renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Writes each output to a file of its own, then renames it into place, so whatever reads main.js — tests building in
// parallel, or Obsidian while `npm run dev` rebuilds — sees the old build or the new one, never half of one.
const swapIn = {
  name: 'swap-in',
  setup(build) {
    build.onEnd((result) => {
      for (const f of result.outputFiles ?? []) {
        const part = `${f.path}.${process.pid}.part`;
        writeFileSync(part, f.contents);
        renameSync(part, f.path);
      }
    });
  },
};

// Exported so scripts/quality-metrics.mjs measures the bundle this build makes, not a copy of its settings.
export const options = {
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
  write: false,
  plugins: [swapIn],
};

// --watch (npm run dev): rebuild on every save, for installing into a test vault. Only when run, never when imported.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--watch')) await (await esbuild.context(options)).watch();
  else await esbuild.build(options);
}
