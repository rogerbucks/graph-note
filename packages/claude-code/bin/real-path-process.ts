// A file's real path, for the Claude Code host (spec §26): run by node as a process, because the mod's file calls settle
// no links. The path comes as the one argument, never through a shell; the real path goes out on stdout, and a path that
// cannot be settled exits with a code that is not 0, saying nothing of the path.
import { realpathSync } from 'node:fs';

const path = process.argv[2];
try {
  if (!path) throw new Error('no path');
  process.stdout.write(realpathSync(path));
} catch {
  process.exitCode = 1;
}
