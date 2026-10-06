// Helpers the repository tests use to read the repository. Test code only —
// nothing here ships in the plugin.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';
import { execFileSync } from 'node:child_process';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const path = (rel) => join(ROOT, rel);
export const exists = (rel) => existsSync(path(rel));
export const read = (rel) => readFileSync(path(rel), 'utf8');
export const readJSON = (rel) => JSON.parse(read(rel));

const SKIP = new Set(['node_modules', '.git', '.venv', 'dist', '__pycache__']);

/** Every file under a folder, as repo-relative paths. */
export function walk(rel) {
  if (!exists(rel)) return [];
  return readdirSync(path(rel)).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const child = rel === '.' ? name : `${rel}/${name}`;
    return statSync(path(child)).isDirectory() ? walk(child) : [child];
  });
}

/** True when git would not ignore the file, so it can be committed. */
export function notIgnored(rel) {
  try {
    execFileSync('git', ['check-ignore', '-q', rel], { cwd: ROOT });
    return false;
  } catch (e) {
    return e.status === 1;
  }
}

/** The JavaScript packages: the root and each workspace, as folders. */
export const jsPackages = () => [
  '.',
  ...walk('packages')
    .filter((f) => /^packages\/[^/]+\/package\.json$/.test(f))
    .map((f) => dirname(f)),
];

/** Source the plugin and libraries ship: every package's src folder. */
export const sourceFiles = () =>
  jsPackages()
    .filter((p) => p !== '.')
    .flatMap((p) => walk(`${p}/src`))
    .filter((f) => /\.(ts|tsx|js|mjs|cjs)$/.test(f));

export const workflowFiles = () => walk('.github/workflows').filter((f) => /\.ya?ml$/.test(f));

// ── Workflow YAML, read by indentation ──
// The workflows are ours and written in plain block style, so a reader of
// indentation is enough and keeps a YAML parser out of the dependencies.

export const stripComment = (line) => line.replace(/\s+#.*$/, '').replace(/^\s*#.*$/, '');

/** Lines of the block under `key:` at the given indent, including its own line. */
export function block(lines, key, indent) {
  const pad = ' '.repeat(indent);
  const start = lines.findIndex((l) => stripComment(l).startsWith(`${pad}${key}:`));
  if (start === -1) return null;
  const out = [lines[start]];
  for (const line of lines.slice(start + 1)) {
    const bare = stripComment(line);
    if (bare.trim() === '') continue;
    if (bare.length - bare.trimStart().length <= indent) break;
    out.push(line);
  }
  return out;
}

/** The values in a permissions block, in scalar form or map form. */
export function permissionValues(permBlock) {
  const [head, ...rest] = permBlock.map(stripComment);
  const scalar = head.split(':').slice(1).join(':').trim();
  if (scalar) return [scalar];
  return rest.filter((l) => l.trim()).map((l) => l.split(':').slice(1).join(':').trim());
}

/** Jobs of a workflow, by name, each as its lines. */
export function jobs(text) {
  const jobsBlock = block(text.split('\n'), 'jobs', 0);
  if (!jobsBlock) return {};
  const out = {};
  let current = null;
  for (const line of jobsBlock.slice(1)) {
    const m = /^ {2}([\w-]+):\s*$/.exec(stripComment(line));
    if (m) out[(current = m[1])] = [];
    else if (current) out[current].push(line);
  }
  return out;
}

/** Every `uses:` reference in a workflow. */
export const usesRefs = (text) =>
  [...text.matchAll(/^\s*(?:-\s*)?uses:\s*['"]?([^'"\s#]+)/gm)].map((m) => m[1]);

/** Every `run:` command in a workflow, in order, joined into one string per step. */
export const runCommands = (text) =>
  [...text.matchAll(/^(\s*)(?:-\s*)?run:\s*(\|?)(.*)$/gm)].map((m, i, all) => {
    if (!m[2]) return m[3].trim();
    // A block scalar: the indented lines that follow.
    const after = text.slice(m.index + m[0].length).split('\n').slice(1);
    const body = [];
    for (const l of after) {
      if (l.trim() && l.length - l.trimStart().length <= m[1].length + 2) break;
      body.push(l.trim());
    }
    return body.join('\n').trim();
  });

// ── Source scanners ──

const NETWORK = /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\brequestUrl\b|\bEventSource\b|\bsendBeacon\b/;
export const findsNetwork = (code) => NETWORK.test(code);

export const findsHotkeys = (code) => /\bhotkeys\s*:/.test(code);

const FORBIDDEN_MODULES = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  'electron',
]);
/** Modules a piece of source imports or requires that mobile does not have. */
export function forbiddenImports(code) {
  const specs = [
    ...code.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g),
    ...code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...code.matchAll(/\bimport\s+['"]([^'"]+)['"]/g),
    ...code.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((m) => m[1]);
  return specs.filter((s) => FORBIDDEN_MODULES.has(s) || FORBIDDEN_MODULES.has(s.split('/')[0]));
}
