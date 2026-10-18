// Bundles the /graph mod:
// - mod/hooks/graph.js, what its hooks module runs. It is platform neutral, because a mod has no Node and no
//   WebAssembly. Tree-shaking leaves the core's engine out.
// - mod/bin/render.mjs, the core's Graphviz engine, run by node as a process.
// - mod/bin/editor-server.mjs, the browser editor's local server.
// Then the mod's test fixtures: the test vault's sample note, and the SVG Graphviz draws for it.
import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPage } from './esbuild.page.mjs';

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
// the real path of a file, which node settles for the mod, whose file calls settle no links (spec §26)
await esbuild.build({
  ...common,
  entryPoints: ['bin/real-path-process.ts'],
  outfile: join(mod, 'bin/real-path.mjs'),
  platform: 'node',
});
// Claude's proposal sent to that server, which node does for the mod, whose hooks have no network (spec §26)
await esbuild.build({
  ...common,
  entryPoints: ['bin/propose-process.ts'],
  outfile: join(mod, 'bin/propose.mjs'),
  platform: 'node',
});
// the browser editor's local server, which node runs as a process of its own (spec §26)
await esbuild.build({
  ...common,
  entryPoints: ['server/editor-server.ts'],
  outfile: join(mod, 'bin/editor-server.mjs'),
  platform: 'node',
});

// the browser editor's page, which that server serves from its own origin (esbuild.page.mjs)
await buildPage(join(mod, 'page'));

const graph = await import(`${join(mod, 'hooks/graph.js')}?${Date.now()}`);
const note = readFileSync(join(here, '../../test-vault/Sample graph note.md'), 'utf8');
const dots = [];
await graph.viewOf(note, async (d) => (dots.push(...d), { why: 'only the sources were wanted' }), graph.PANE_PALETTE);
const svgs = execFileSync('node', [join(mod, 'bin/render.mjs')], { input: JSON.stringify(dots), encoding: 'utf8' });
writeFileSync(
  join(mod, 'tests/fixtures.js'),
  "// Made by esbuild.config.mjs: the test vault's sample note, and the SVG Graphviz draws for each layout of its graph.\n" +
    `export const NOTE = ${JSON.stringify(note)};\nexport const SVGS = ${svgs};\n`,
);
