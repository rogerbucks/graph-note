// bin/real-path-process.ts
import { realpathSync } from "node:fs";
var path = process.argv[2];
try {
  if (!path) throw new Error("no path");
  process.stdout.write(realpathSync(path));
} catch {
  process.exitCode = 1;
}
