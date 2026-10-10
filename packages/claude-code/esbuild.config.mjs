// Bundles the /graph mod: mod/hooks/graph.js, what its hooks module runs (platform neutral: a mod has no Node and no
// WebAssembly, and the core's engine is left out by tree-shaking), and mod/bin/render.mjs, the core's Graphviz engine run
// by node as a process. Then the mod's test fixtures: the test vault's sample note, and the SVG Graphviz draws for it.
import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mod = join(here, 'mod');
const common = { absWorkingDir: here, bundle: true, format: 'esm', legalComments: 'inline', logLevel: 'warning' };

await esbuild.build({
  ...common,
  entryPoints: ['src/mod-entry.ts'],
  outfile: join(mod, 'hooks/graph.js'),
  platform: 'neutral',
  mainFields: ['module', 'main'],
});
await esbuild.build({
  ...common,
  entryPoints: ['bin/render-process.ts'],
  outfile: join(mod, 'bin/render.mjs'),
  platform: 'node',
});

const graph = await import(`${join(mod, 'hooks/graph.js')}?${Date.now()}`);
const note = readFileSync(join(here, '../../test-vault/Sample graph note.md'), 'utf8');
const dots = [];
await graph.viewOf(
  note,
  async (d) => (dots.push(...d), { why: 'only the sources were wanted' }),
  graph.paletteFor('dark'),
);
const svgs = execFileSync('node', [join(mod, 'bin/render.mjs')], { input: JSON.stringify(dots), encoding: 'utf8' });
writeFileSync(
  join(mod, 'tests/fixtures.js'),
  "// Made by esbuild.config.mjs: the test vault's sample note, and the SVG Graphviz draws for each layout of its graph.\n" +
    `export const NOTE = ${JSON.stringify(note)};\nexport const SVGS = ${svgs};\n`,
);
