// Licence helpers for the licence tests: the allow-list, a reader of SPDX
// licence expressions, and the bundled packages and build tools as the
// lockfile records them. Test code only.
import { readJSON } from './repo.js';

// Compatible with distributing the plugin under MIT (spec §13, Licence).
const ALLOWED = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'Zlib']);
// Weak copyleft at the file level, distributed unmodified with its notice and
// a link to its source: allowed for this one component and no other.
const ALLOWED_FOR = { 'EPL-2.0': new Set(['Graphviz']) };
// Exceptions that only widen what a licence permits.
const PERMISSIVE_EXCEPTIONS = new Set(['LLVM-exception']);

/** Splits an SPDX expression into tokens: ids, AND, OR, WITH and brackets. */
const tokens = (expr) => expr.replace(/[()]/g, ' $& ').trim().split(/\s+/);

/**
 * True when an SPDX licence expression is on the allow-list. OR needs one
 * allowed side, AND needs both. `component` names what carries the licence,
 * for licences allowed for one component alone.
 */
export function licenceAllowed(expr, component) {
  if (typeof expr !== 'string' || !expr.trim()) return false;
  const ts = tokens(expr);
  let i = 0;
  const leaf = (id) => ALLOWED.has(id) || Boolean(component && ALLOWED_FOR[id]?.has(component));
  const primary = () => {
    if (ts[i] === '(') {
      i++;
      const v = or();
      i++; // ')'
      return v;
    }
    const id = ts[i++];
    if (ts[i] === 'WITH') {
      i++;
      return leaf(id) && PERMISSIVE_EXCEPTIONS.has(ts[i++]);
    }
    return leaf(id);
  };
  const and = () => {
    let v = primary();
    while (ts[i] === 'AND') {
      i++;
      v = primary() && v;
    }
    return v;
  };
  const or = () => {
    let v = and();
    while (ts[i] === 'OR') {
      i++;
      v = and() || v;
    }
    return v;
  };
  const result = or();
  return i === ts.length && result;
}

const WASM_MAGIC = Buffer.from([0, 0x61, 0x73, 0x6d]);
/** True when a file is WebAssembly, or carries it inlined as base64. */
export const carriesWasm = (name, content) =>
  name.endsWith('.wasm') || content.subarray(0, 4).equals(WASM_MAGIC) || content.includes('AGFzbQ');

const lockEntries = () =>
  Object.entries(readJSON('package-lock.json').packages)
    .filter(([key, v]) => key.includes('node_modules/') && !v.link)
    .map(([key, v]) => ({
      name: key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length),
      version: v.version,
      licence: v.license,
      dev: Boolean(v.dev),
    }));

/** Packages that can reach a release: everything the lockfile does not mark dev. */
export const bundledPackages = () => lockEntries().filter((p) => !p.dev);

/** Packages used only to build, test and lint. */
export const buildTools = () => lockEntries().filter((p) => p.dev);

/** Every package the lockfile holds, dev or not: what can be in node_modules. */
export const lockedNames = () => lockEntries().map((p) => p.name);

/**
 * What is wrong with the allowance for GPL tools that run in CI alone (spec §13, build_tool_licences), in `record`
 * (licences/bundled.json): each must be a GPL tool, with where its licence is stated, how it is installed, the jobs
 * that install it and why; and none may be a package the lockfile holds (`locked`: so nothing in node_modules, dev or
 * not), a bundled package, or anything a bundled package carries inside it. Names are compared in any case.
 */
export function ciOnlyProblems(record, locked) {
  const lower = (s) => String(s).toLowerCase();
  const shipped = new Set(
    Object.entries(record.packages ?? {})
      .flatMap(([key, p]) => [key.slice(0, key.lastIndexOf('@')), ...(p.inside ?? []).map((c) => c.name)])
      .map(lower),
  );
  const installed = new Set(locked.map(lower));
  return Object.entries(record.ciOnlyTools?.tools ?? {}).flatMap(([name, t]) => {
    const found = [];
    if (!/^(?:A|L)?GPL-/.test(t.licence ?? '')) found.push(`${name}: the allowance is for GPL tools, not ${t.licence}`);
    if (!/^https:\/\//.test(t.licenceSource ?? '')) found.push(`${name}: where its licence is stated`);
    if (!t.reason?.trim()) found.push(`${name}: why it is needed`);
    const installedInCi = /apt-get install/.test(t.installedBy ?? '') && t.jobs?.length > 0;
    if (!installedInCi) found.push(`${name}: how and where CI installs it`);
    if (installed.has(lower(name))) found.push(`${name}: in the lockfile, so in node_modules, never CI alone`);
    if (shipped.has(lower(name))) found.push(`${name}: bundled, or inside what is bundled, so shipped`);
    return found;
  });
}

/** Each package a workflow's job installs with apt-get, as `<file> <job>` against the packages' names. */
export function aptInstalls(file, jobLines) {
  const out = [];
  for (const [job, lines] of Object.entries(jobLines))
    for (const m of lines.join('\n').matchAll(/apt-get install\s+((?:-\S+\s+)*)([^\n&|;]+)/g))
      for (const name of m[2].trim().split(/\s+/)) out.push({ job: `${file} ${job}`, name });
  return out;
}
