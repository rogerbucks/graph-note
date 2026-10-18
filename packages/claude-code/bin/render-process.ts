// The Graphviz process for the Claude Code host (spec §10): the core's own bundled engine, run by node. The DOT sources
// come in on stdin as a JSON list. The SVG for each goes out on stdout as a JSON list, in the same order.
import { loadEngine } from '@thoughtknot/core';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d: string) => (input += d));
process.stdin.on('end', () => {
  void (async () => {
    const engine = await loadEngine();
    const sources = JSON.parse(input || '[]') as string[];
    process.stdout.write(JSON.stringify(sources.map((s) => engine.render(s))));
  })().catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
});
