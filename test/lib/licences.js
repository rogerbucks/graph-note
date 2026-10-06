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
    while (ts[i] === 'AND') { i++; v = primary() && v; }
    return v;
  };
  const or = () => {
    let v = and();
    while (ts[i] === 'OR') { i++; v = and() || v; }
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
