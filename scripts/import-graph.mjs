// The repository's import graph, and the tests that reach a file through it (editor spec §13, affected_tests_by_imports).
//
// A test reaches a file in any of these ways:
// - it imports it, directly or through modules that import it;
// - it names it as a path to build or load, as an esbuild entry point is named;
// - it names a folder of the repository it walks, as the page's tests read their folder. A folder named reaches every
//   file in it.
// Imports are read from the text: `import … from`, `export … from`, a bare `import '…'` and `import('…')`. Each is
// relative, or by a workspace package's name and the paths its `exports` map. A folder built from several pieces is not
// seen: the full suite, which runs before every merge and in CI, covers it.
import { dirname, join, normalize } from 'node:path';

const JS_TEST = /\.test\.(js|mjs)$/;
const PY_TEST = /(^|\/)tests\/test_\w+\.py$/;
const CODE = /\.(ts|js|mjs)$/;
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"\n]+)['"]/g;
const NAMED_PATH = /['"`]([\w./-]+\.(?:ts|js|mjs))['"`]/g;
// a quoted word or path, or the last piece of a template after its last placeholder: what a folder may be named by
const NAMED_FOLDER = /(?:['"`]|\})([\w./-]{3,}?)\/?['"`]/g;
const TRIED = ['', '.ts', '.js', '.mjs', '/index.ts', '/index.js'];

/** Whether `path` is a test file: one the test runner runs. */
export const isTestFile = (path) => JS_TEST.test(path) || PY_TEST.test(path);

/** Whether `path` sits in a test folder: a test, or the support the tests share. */
const inTestFolder = (path) => /(^|\/)tests?\//.test(path);

/** The workspace packages among `files`: each one's name, folder and `exports` map, from its package.json. */
function workspaces(files, read) {
  const found = new Map();
  for (const f of files) {
    if (!/^packages\/[^/]+\/package\.json$/.test(f)) continue;
    try {
      const { name, exports, main } = JSON.parse(read(f));
      if (name) found.set(name, { dir: dirname(f), exports: exports ?? (main ? { '.': `./${main}` } : {}) });
    } catch {
      /* a package.json that does not parse maps nothing */
    }
  }
  return found;
}

/** The target an `exports` entry names: a path, or the default of a set of conditions. */
const target = (entry) => (typeof entry === 'string' ? entry : (entry?.default ?? entry?.import ?? null));

/** The file a package specifier names, by the package's `exports` map; null when the map has no such path. */
function packageFile(specifier, packages) {
  for (const [name, { dir, exports }] of packages) {
    if (specifier !== name && !specifier.startsWith(`${name}/`)) continue;
    const sub = `.${specifier.slice(name.length)}`;
    const exact = target(exports[sub]);
    if (exact) return join(dir, exact);
    for (const [pattern, entry] of Object.entries(exports)) {
      const star = pattern.indexOf('*');
      const to = target(entry);
      if (star === -1 || !to) continue;
      const head = pattern.slice(0, star);
      const tail = pattern.slice(star + 1);
      if (sub.startsWith(head) && sub.endsWith(tail) && sub.length >= head.length + tail.length)
        return join(dir, to.replaceAll('*', sub.slice(head.length, sub.length - tail.length)));
    }
    return null;
  }
  return null;
}

/** The first of `bases`, with an extension tried after each, that is a file of the repository. */
function existing(bases, present) {
  for (const b of bases) for (const ext of TRIED) if (present.has(normalize(b + ext))) return normalize(b + ext);
  return null;
}

/**
 * The import graph of `files` (paths from the repository's root), read through `read(path)`. For each file of code it
 * gives the files of the repository it imports. For each file in a test folder it also gives the files it names as
 * paths.
 */
export function importGraph(files, read) {
  const present = new Set(files);
  const folders = new Map();
  for (const f of files)
    for (let d = dirname(f); d !== '.'; d = dirname(d)) {
      if (!folders.has(d)) folders.set(d, []);
      folders.get(d).push(f);
    }
  const packages = workspaces(files, read);
  const graph = new Map();
  for (const file of files) {
    if (!CODE.test(file)) continue;
    let text;
    try {
      text = read(file);
    } catch {
      continue;
    }
    if (typeof text !== 'string') continue;
    const dir = dirname(file);
    const edges = new Set();
    for (const [, spec] of text.matchAll(SPECIFIER)) {
      const to = spec.startsWith('.')
        ? existing([join(dir, spec)], present)
        : existing([packageFile(spec, packages)].filter(Boolean), present);
      if (to && to !== file) edges.add(to);
    }
    if (inTestFolder(file)) {
      const root = /^packages\/[^/]+/.exec(file)?.[0];
      for (const [, named] of text.matchAll(NAMED_PATH)) {
        const to = existing([join(dir, named), ...(root ? [join(root, named)] : []), named], present);
        if (to && to !== file) edges.add(to);
      }
      for (const [, named] of text.matchAll(NAMED_FOLDER)) {
        const bases = [join(dir, named), ...(root ? [join(root, named)] : [])].map(normalize);
        const folder = bases.find((b) => folders.has(b) && !file.startsWith(`${b}/`));
        for (const f of folder ? folders.get(folder) : []) if (CODE.test(f) && !isTestFile(f)) edges.add(f);
      }
    }
    graph.set(file, edges);
  }
  return graph;
}

const reversed = new WeakMap();

/** For each file, the files that import or name it: `graph` turned round, worked out once for each graph. */
function importersOf(graph) {
  if (!reversed.has(graph)) {
    const importers = new Map();
    for (const [from, edges] of graph)
      for (const to of edges) {
        if (!importers.has(to)) importers.set(to, []);
        importers.get(to).push(from);
      }
    reversed.set(graph, importers);
  }
  return reversed.get(graph);
}

/** The test files that reach `path` through `graph`, sorted; a test file reaches itself. */
export function testsReaching(graph, path) {
  const importers = importersOf(graph);
  const seen = new Set([path]);
  const queue = [path];
  while (queue.length)
    for (const from of importers.get(queue.pop()) ?? [])
      if (!seen.has(from)) {
        seen.add(from);
        queue.push(from);
      }
  return [...seen].filter(isTestFile).sort();
}
