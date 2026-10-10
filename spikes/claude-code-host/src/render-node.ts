// Graphviz for the mod, run as a process of its own: the core's bundled engine, DOT sources in on stdin as a JSON list,
// the SVG for each out on stdout as a JSON list.
import { loadEngine } from '../../../packages/core/src/engine.ts';

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', async () => {
  const engine = await loadEngine();
  const sources: string[] = JSON.parse(input || '[]');
  process.stdout.write(JSON.stringify(sources.map((s) => engine.render(s))));
});
