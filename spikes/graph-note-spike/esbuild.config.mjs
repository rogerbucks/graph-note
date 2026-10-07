// Builds the throwaway phone spike into main.js beside this file.
import esbuild from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
await esbuild.build({
  absWorkingDir: here,
  entryPoints: ['src/main.ts'],
  outfile: join(here, 'main.js'),
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  external: ['obsidian'],
  legalComments: 'inline',
  logLevel: 'warning',
});
