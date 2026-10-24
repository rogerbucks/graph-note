// The engine cannot send (editor spec §38, engine_never_sends). Its code holds no way out to a network or another
// program. Its guard functions are pure: the same answer every time, with nothing changed and nothing called.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const { guardHolds } = createRequire(import.meta.url)('../../graph-spec/src/rules/guards.js');

const ROOT = new URL('../../../', import.meta.url);
/** The engine: the core and the graph spec library, their shipped code only. */
const ENGINE = ['packages/core/src/', 'packages/graph-spec/src/'];

/** Every source file of the engine, as [path, text]. */
export const engineFiles = () =>
  ENGINE.flatMap((dir) =>
    readdirSync(new URL(dir, ROOT), { recursive: true })
      .map((f) => `${dir}${String(f).replaceAll('\\', '/')}`)
      .filter((f) => /\.(ts|js|mjs|cjs)$/.test(f) && !f.endsWith('.d.ts'))
      .map((f) => [f, readFileSync(new URL(f, ROOT), 'utf8')]),
  );

/** The ways out: a network call, a socket, a beacon, or a module that reaches a network or another program. */
export const SENDS = [
  /\bfetch\s*\(/,
  /\bnew\s+(?:XMLHttpRequest|WebSocket|EventSource)\b/,
  /\bsendBeacon\s*\(/,
  /(?:require\(|from\s+)['"](?:node:)?(?:https?|http2|net|tls|dgram|child_process|worker_threads)['"]/,
];

test('the engine build has no network-send path and guard functions have no side effects', () => {
  const found = engineFiles().flatMap(([file, text]) => SENDS.filter((s) => s.test(text)).map((s) => `${file} ${s}`));
  assert.deepEqual(found, []);

  const context = Object.freeze({ amount: 120, state: 'Approved', tries: 2 });
  const guard = "amount > 100 and state == 'Approved' and not tries >= 3";
  const answers = Array.from({ length: 3 }, () => guardHolds(guard, context));
  assert.deepEqual(answers, [true, true, true]);
  // a guard is comparisons only: one that would call something is refused, never run
  assert.throws(() => guardHolds('fetch()', context), /refused/);
});
