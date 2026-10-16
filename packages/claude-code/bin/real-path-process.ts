// A file's real path, for the Claude Code host (spec §26): run by node as a process, because the mod's file calls settle
// no links. It is started with no shell and the path is the one argument, after `--`, so a path that starts with a dash
// is a path. The real path goes out on stdout and nothing else does; a path that cannot be settled, or an argument list
// that is not exactly `-- <path>`, exits with a code that is not 0 and says nothing of the path.
import { realpathSync } from 'node:fs';

const args = process.argv.slice(2);
try {
  if (args.length !== 2 || args[0] !== '--' || !args[1]) throw new Error('not `-- <path>`');
  process.stdout.write(realpathSync(args[1]));
} catch {
  process.exitCode = 1;
}
