// A file's real path, asked of a host that can only start a process (spec §26): the mod's file calls read and test for a
// file but do not settle links, so to know where a matrix note really is, the mod starts the shipped process
// (bin/real-path.mjs, run by node) with the path as its one argument. A path that cannot be settled is an error, and the
// caller refuses what it cannot place.
import type { EditorPorts } from './editor-launch.ts';

/** `realPath` over the host's process call and the command that runs the shipped process: the real path, or a rejection. */
export function realPathVia(
  spawn: EditorPorts['spawn'],
  program: readonly string[],
): (path: string) => Promise<string> {
  return async (path) => {
    const pieces = spawn({ argv: [...program, path] })[Symbol.asyncIterator]();
    let out = '';
    for (;;) {
      const next = await pieces.next();
      if (next.done) {
        if (next.value.code !== 0 || !out) throw new Error('The real path could not be found.');
        return out;
      }
      if (next.value.stream === 'stdout') out += next.value.text;
    }
  };
}
