// A plug-in a host did not ship, loaded from its file (editor spec §54, plugin_outside_file; API-10). A host loads one
// only this way, in a worker (plugin-serve.ts, plugin-isolated.ts):
// - the host reads the file as text and checks it first, so a file that imports other code never starts a worker;
// - the worker's script is the host's own start, then the file. The start takes away the network (`lockDown`). It
//   takes every way to make code from text too (`sealCode`). So all of it is gone before the file's first line runs;
// - the file holds no `import`, and it cannot write one, so it can load no more code. Nothing is imported or
//   evaluated to run it: it is part of the worker's own script.
import { lockDown, servePlugin } from './plugin-serve.ts';
import type { PluginScope } from './plugin-serve.ts';
import { isolatedPlugin } from './plugin-isolated.ts';
import type { IsolatedOptions, IsolatedPlugin, PluginPort } from './plugin-isolated.ts';
import type { ThoughtKnotPlugin } from './plugins.ts';

/** The most characters a plug-in's file may hold. */
export const OUTSIDE_CHARACTERS = 2_000_000;

/**
 * Why a plug-in's file is refused, or null. It is refused when it:
 * - holds the word `import` anywhere, even in a comment, as that is the only way code loads code;
 * - exports anything but its default, which is the plug-in, written `export default` at the start of a line;
 * - is over `OUTSIDE_CHARACTERS` long.
 */
export function outsideProblem(code: string): string | null {
  if (code.length > OUTSIDE_CHARACTERS) return `its file is over the ${OUTSIDE_CHARACTERS} characters allowed`;
  if (/\bimport\b/.test(code))
    return 'it imports other code, and a plug-in from outside must be one file that imports nothing';
  if (!/^export default\b/m.test(code)) return 'its file has no default export at the start of a line';
  if (code.match(/\bexport\b/g)?.length !== 1) return 'its file exports more than its default, the plug-in';
  return null;
}

const refuse = () => {
  throw new EvalError('A plug-in may not make code from text.');
};

/**
 * Takes from `scope` every way to make code from text. That is `eval` and `Function`, the maker every kind of function
 * reaches as its `constructor`, and a timer given text. Gives back the names it could not take.
 */
export function sealCode(scope: object): string[] {
  const makers = [function () {}, async function () {}, function* () {}, async function* () {}].map(
    (f) => Object.getPrototypeOf(f) as object,
  );
  for (const proto of makers)
    Object.defineProperty(proto, 'constructor', { value: refuse, writable: false, configurable: false });
  for (const name of ['eval', 'Function'])
    for (let o: object | null = scope; o; o = Object.getPrototypeOf(o) as object | null)
      if (Object.hasOwn(o, name)) Reflect.deleteProperty(o, name);
  const s = scope as Record<string, unknown>;
  for (const name of ['setTimeout', 'setInterval']) {
    const timer = s[name];
    if (typeof timer !== 'function') continue;
    s[name] = (run: unknown, ...rest: unknown[]) =>
      typeof run === 'function' ? (Reflect.apply(timer, scope, [run, ...rest]) as unknown) : refuse();
  }
  const kept = ['eval', 'Function'].filter((n) => n in scope);
  for (const proto of makers) if ((proto as { constructor: unknown }).constructor !== refuse) kept.push('a maker');
  return kept;
}

/**
 * The start of the worker's script, run before the file: seals `scope` and gives back the call that serves the file's
 * plug-in. It throws when it cannot take something away, so the file never runs.
 */
export function sealOutside(scope: PluginScope & object): (plugin: unknown) => void {
  const kept = [...lockDown(scope), ...sealCode(scope)];
  if (kept.length) throw new Error(`The worker could not take away ${kept.join(', ')}.`);
  let served = false;
  return (plugin) => {
    if (served) return;
    served = true;
    if (typeof (plugin as ThoughtKnotPlugin | undefined)?.register !== 'function')
      return scope.postMessage({ failed: 'its default export is not a plug-in' });
    servePlugin(scope, plugin as ThoughtKnotPlugin);
  };
}

/**
 * The rest of the worker's script: the file, its default export kept as `thoughtknotPlugin`, then served. The host's
 * start comes before it and names the call `sealOutside` gave `thoughtknotServe`.
 */
export function outsideBody(code: string): string {
  return `${code.replace(/^export default\b/m, 'const thoughtknotPlugin =')}\n;thoughtknotServe(thoughtknotPlugin);\n`;
}

/**
 * The host's side: the plug-in in `code`, served by the worker `start` runs `body` in. A file `outsideProblem` refuses
 * never starts one. Whatever goes wrong in the worker is named, as the start limit and the worker's errors are.
 */
export function outsidePlugin(
  code: string,
  start: (body: string) => PluginPort,
  options: IsolatedOptions,
): Promise<IsolatedPlugin> {
  const problem = outsideProblem(code);
  if (problem) return Promise.reject(new Error(`The plug-in was not loaded, as ${problem}.`));
  return isolatedPlugin(start(outsideBody(code)), options);
}
