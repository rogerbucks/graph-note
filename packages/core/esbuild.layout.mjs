// Bundles the layout source's Node program into one file, packages/core/dist/layout-source-node.cjs. The graph library
// and the locked style are inside it. So the vault runs its vendored copy with nothing beside it (spec §12).
import esbuild from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
await esbuild.build({
  absWorkingDir: here,
  entryPoints: ['bin/layout-source-node.mjs'],
  outfile: join(here, 'dist', 'layout-source-node.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  legalComments: 'inline',
  logLevel: 'warning',
});
