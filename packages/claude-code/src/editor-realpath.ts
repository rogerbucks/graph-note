// A file's real path, asked of a host that can only start a process (spec §26): the mod's file calls read and test for a
// file but do not settle links, so to know where a matrix note really is, the mod starts node with a fixed one-line script
// and the path as an argument, never part of the script. A path that cannot be settled is an error, and the caller
// refuses what it cannot place.
import type { EditorPorts } from './editor-launch.ts';

const SCRIPT = "process.stdout.write(require('fs').realpathSync(process.argv[1]))";

/** `realPath` over the host's process call: the file's real path, or a rejection when it cannot be settled. */
export function realPathVia(spawn: EditorPorts['spawn']): (path: string) => Promise<string> {
  return async (path) => {
    const pieces = spawn({ argv: ['node', '-e', SCRIPT, path] })[Symbol.asyncIterator]();
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
