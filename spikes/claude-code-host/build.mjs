// Bundles the core into the /graph mod: core.js for the hooks module, and bin/render.mjs,
// the Graphviz process.
import esbuild from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const common = { absWorkingDir: here, bundle: true, format: 'esm', legalComments: 'inline', logLevel: 'warning' };
await esbuild.build({
  ...common,
  entryPoints: ['src/core-entry.ts'],
  outfile: join(here, 'mod/hooks/core.js'),
  platform: 'neutral',
});
await esbuild.build({
  ...common,
  entryPoints: ['src/render-node.ts'],
  outfile: join(here, 'mod/bin/render.mjs'),
  platform: 'node',
});

// The test's fixtures: the sample note, and what Graphviz draws for it, made by the same bundles the mod runs.
const { readFileSync, writeFileSync } = await import('node:fs');
const { execFileSync } = await import('node:child_process');
const core = await import(join(here, 'mod/hooks/core.js'));
const note = readFileSync(join(here, 'mod/fixtures/sample.md'), 'utf8');
const [drawing] = core.readNote(core.gqlBlocks(note).map((b) => b.text)).graphs.values();
const dots = JSON.stringify(core.directions(drawing).map((d) => d.dot));
const svgs = execFileSync('node', [join(here, 'mod/bin/render.mjs')], { input: dots, encoding: 'utf8' });
writeFileSync(
  join(here, 'mod/tests/fixtures.js'),
  [
    '// Made by build.mjs: the sample note, and the SVG Graphviz draws for each direction of its graph.',
    `export const NOTE = ${JSON.stringify(note)};`,
    `export const SVGS = ${svgs};`,
    '',
  ].join('\n'),
);
