// A file's real path, for the Claude Code host (spec §26): run by node as a process, because the mod's file calls settle
// no links. It is started with no shell and the path is the one argument, after `--`, so a path that starts with a dash
// is a path. The answer goes out on stdout and nothing else does; an argument list that is not exactly `-- <path>` (or
// `--link -- <path>`) exits with a code that is not 0 and says nothing of the path.
//
// `-- <path>`: the real path, links settled, in the case the disk keeps (`realpathSync.native`). Exit 2 when the path is
// not there (ENOENT, ENOTDIR), 1 when it cannot be settled for any other reason.
// `--link -- <path>`: where the link at `path` leads, as a full path settled from the link's own folder, even when that
// is nowhere yet. Exit 3 when `path` is not a link or is not there, 1 for any other failure.
import { readlinkSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const NOT_THERE = new Set(['ENOENT', 'ENOTDIR']);
const args = process.argv.slice(2);
try {
  const link = args[0] === '--link';
  const rest = link ? args.slice(1) : args;
  if (rest.length !== 2 || rest[0] !== '--' || !rest[1]) throw new Error('not `-- <path>`');
  const path = rest[1];
  if (link) {
    try {
      // a relative target is read from the real path of the link's folder, which may itself be reached through a link
      process.stdout.write(resolve(realpathSync.native(dirname(path)), readlinkSync(path)));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? '';
      if (code === 'EINVAL' || NOT_THERE.has(code)) process.exitCode = 3;
      else throw err;
    }
  } else {
    try {
      process.stdout.write(realpathSync.native(path));
    } catch (err) {
      if (NOT_THERE.has((err as NodeJS.ErrnoException).code ?? '')) process.exitCode = 2;
      else throw err;
    }
  }
} catch {
  process.exitCode = 1;
}
