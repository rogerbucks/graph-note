// bin/real-path-process.ts
import { realpathSync } from "node:fs";
var args = process.argv.slice(2);
try {
  if (args.length !== 2 || args[0] !== "--" || !args[1]) throw new Error("not `-- <path>`");
  process.stdout.write(realpathSync(args[1]));
} catch {
  process.exitCode = 1;
}
