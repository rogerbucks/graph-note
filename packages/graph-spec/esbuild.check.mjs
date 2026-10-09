// Bundles the graph-spec library's entry point and its feature modules into one self-contained file,
// packages/graph-spec/dist/graph-spec-check.js: loaded as a script it sets the page global GraphSpecCheck, and required
// in Node it is the module. The release archive ships it at src/graph-spec-check.js, the path the vault vendors.
// Usage: node esbuild.check.mjs [outfile]   (the outfile defaults to dist/graph-spec-check.js; the tests build elsewhere)
import esbuild from 'esbuild';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outfile = process.argv[2] ? resolve(process.argv[2]) : join(here, 'dist', 'graph-spec-check.js');
await esbuild.build({
  absWorkingDir: here,
  entryPoints: ['src/graph-spec-check.js'],
  outfile,
  bundle: true,
  platform: 'neutral',
  format: 'iife',
  globalName: 'GraphSpecCheck',
  charset: 'utf8',
  legalComments: 'inline',
  banner: {
    js: [
      '// Generated from packages/graph-spec/src by packages/graph-spec/esbuild.check.mjs — do not hand-edit.',
      '// The graph spec checker in one plain file: as a script it sets the global GraphSpecCheck; in Node, require() it.',
    ].join('\n'),
  },
  footer: { js: "if (typeof module === 'object' && module && module.exports) module.exports = GraphSpecCheck;" },
  logLevel: 'warning',
});
