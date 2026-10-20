// Each layer imports only the layers below it (editor spec §43, layers_checked). The layers, the parts in each and what
// each layer uses come from requirements/architecture.gql. A file belongs to the part whose folder holds it most
// closely, so the display layer's folder inside the core is the display layer's. A layer may use itself and every layer
// it USES, directly or through others. Test folders and built files are left out: they are not the shipped code.
//
//   node scripts/layers.mjs   lists each import that crosses a layer the wrong way, and fails when there is one
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { importGraph } from './import-graph.mjs';

const require = createRequire(import.meta.url);
const gs = require('../packages/graph-spec/src/graph-spec-check.js');
const ROOT = fileURLToPath(new URL('..', import.meta.url));

// files that are not the shipped code: tests and their support, and what a build writes
const LEFT_OUT = /(^|\/)tests?\/|(^|\/)dist\/|^main\.js$|^packages\/claude-code\/mod\/(hooks\/graph\.js|bin\/)/;

/** The layers of `architecture` (the text of architecture.gql): each part's folder and layer, and what each layer may use. */
export function layersOf(architecture) {
  const g = gs.worldFromStore(gs.read([architecture])).project_architecture;
  const name = (id) => g.p(id).name;
  const parts = g
    .labelled('Part')
    .filter((p) => g.p(p).path)
    .map((p) => ({ path: g.p(p).path, part: name(p), layer: name(g.out(p, 'IN_LAYER')[0][2]) }))
    .sort((a, b) => b.path.length - a.path.length);
  const uses = new Map(g.labelled('Layer').map((l) => [name(l), g.out(l, 'USES').map((e) => name(e[2]))]));
  const allowed = new Map();
  for (const layer of uses.keys()) {
    const seen = new Set([layer]);
    const queue = [layer];
    while (queue.length)
      for (const next of uses.get(queue.pop()) ?? []) if (!seen.has(next)) (seen.add(next), queue.push(next));
    allowed.set(layer, seen);
  }
  return { parts, allowed };
}

/** The part a file belongs to: the one whose folder or file holds it most closely; null for none. */
const partOf = (parts, file) => parts.find((p) => file === p.path || file.startsWith(`${p.path}/`)) ?? null;

/**
 * The imports among `files` that cross a layer the wrong way, each read through `read`. Each is {file, imports, from,
 * to}: the file, what it imports, and the two layers. None when every layer keeps to its own.
 */
export function layerProblems(files, read, architecture) {
  const { parts, allowed } = layersOf(architecture);
  const shipped = files.filter((f) => !LEFT_OUT.test(f));
  const out = [];
  for (const [file, edges] of importGraph(shipped, read)) {
    const from = partOf(parts, file);
    if (!from) continue;
    for (const to of edges) {
      const into = partOf(parts, to);
      if (into && !allowed.get(from.layer).has(into.layer))
        out.push({ file, imports: to, from: from.layer, to: into.layer });
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.imports.localeCompare(b.imports));
}

/** The repository's own files, as git lists them. */
export const repoFiles = () =>
  execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  const problems = layerProblems(repoFiles(), read, read('requirements/architecture.gql'));
  for (const p of problems) console.log(`${p.file} imports ${p.imports}: ${p.from} may not use ${p.to}`);
  console.log(
    problems.length
      ? `layers: ${problems.length} imports cross a layer the wrong way`
      : 'layers: each layer imports only the layers below it',
  );
  process.exitCode = problems.length ? 1 : 0;
}
