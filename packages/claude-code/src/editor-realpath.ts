// A file's real path, asked of a host that can only start a process (spec §26): the mod's file calls read and test for a
// file but do not settle links, so to know where a matrix note really is, the mod starts the shipped process
// (bin/real-path.mjs, run by node). The start has no shell; the path is one argument, after `--` so that a path
// starting with a dash is never an option; only stdout is read; a process that does not answer in time is killed; and
// any error is a rejection, which the caller takes as not knowing, and refuses what it cannot place.
import type { EditorPorts } from './editor-launch.ts';

/** How long the process has to answer before it is killed. */
export const REAL_PATH_TIMEOUT_MS = 5000;

/** `realPath` over the host's process call, the command that runs the shipped process and the clock. */
export function realPathVia(
  spawn: EditorPorts['spawn'],
  program: readonly string[],
  after: EditorPorts['after'],
): (path: string) => Promise<string> {
  return async (path) => {
    const pieces = spawn({ argv: [...program, '--', path] })[Symbol.asyncIterator]();
    let fail: (why: Error) => void = () => {};
    const timedOut = new Promise<never>((_, reject) => (fail = reject));
    timedOut.catch(() => {});
    const timer = after(REAL_PATH_TIMEOUT_MS, () => {
      fail(new Error('The process did not answer in time.'));
      void pieces.return?.();
    });
    const answered = (async () => {
      let out = '';
      for (;;) {
        const next = await pieces.next();
        if (next.done) {
          if (next.value.code !== 0 || !out) throw new Error('The real path could not be found.');
          return out;
        }
        if (next.value.stream === 'stdout') out += next.value.text;
      }
    })();
    answered.catch(() => {});
    try {
      return await Promise.race([answered, timedOut]);
    } finally {
      timer.cancel();
    }
  };
}
