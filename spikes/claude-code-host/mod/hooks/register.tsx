// /graph (spec §10, a Claude Code host): reads one graph note with the graph note core, in the mod's own environment,
// and draws its first graph in a pane. Reading, the layout source and theming are the core's, run here; Graphviz
// alone runs as a process of its own (bin/render.mjs, the core's bundled engine), since a mod has no WebAssembly.
import { atom, read, update } from 'claude-code';
import type { EngineInterface, Register } from 'claude-code';

import type { GraphView } from '../types';
import { chosen, directions, gqlBlocks, readNote } from './core.js';

const PANE = 'graph';
const SVG_MAX = 131072;
const view = atom({ plugin: 'graph-view', key: 'view' } as const, null as GraphView | null);

/** The pane's view of a note's first graph: every link as a line, and the SVG when Graphviz drew one that fits. */
async function viewOf($: EngineInterface, path: string): Promise<GraphView> {
  const text = await $.fs.read(path);
  const reading = readNote(gqlBlocks(text).map((b) => b.text));
  const [drawing] = reading.graphs.values();
  if (!drawing) return { title: path, alt: 'No graph in this note.', lines: ['No graph in this note.'] };

  const summary = `${drawing.graph}: ${drawing.boxes.length} things, ${drawing.links.length} links`;
  const lines = [summary, ...drawing.links.map((l) => `${l.from} —${l.type}→ ${l.to}`)];
  const laid = directions(drawing);
  const ran = await $.process.run(['node', `${$.plugin.root}/bin/render.mjs`], {
    stdin: JSON.stringify(laid.map((d) => d.dot)),
  });
  if (ran.exitCode !== 0) return { title: drawing.graph, alt: summary, lines, why: ran.stderr.slice(0, 200) };

  const drawn = chosen(laid, JSON.parse(ran.stdout) as string[]);
  if (drawn.svg.length > SVG_MAX)
    return { title: drawing.graph, alt: summary, lines, why: 'SVG over 131072 characters' };
  return { title: drawing.graph, alt: summary, lines, svg: drawn.svg };
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'graph', description: 'Draw the first graph of a graph note in a pane' });
    return next(e);
  });

  on('command.run', { command: 'graph' }, async ($, e) => {
    const path = e.args.trim() || `${$.plugin.root}/fixtures/sample.md`;
    const shown = await viewOf($, path);
    await update($, view, () => shown);
    await $.ui.open({ id: PANE, title: `Graph: ${shown.title}` });
    return { text: `${shown.lines[0]}${shown.svg ? '' : ` (as text${shown.why ? `: ${shown.why}` : ''})`}` };
  });

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e);
    const { Box, Text } = elements;
    const shown = await read($, view);
    if (!shown) return <Text dimColor>Run /graph to draw a note.</Text>;

    // the terminal draws no Svg (Image and Raster only), though `'Svg' in` its table holds: text stands in there
    const Svg = e.surface !== 'terminal' && 'Svg' in elements ? elements.Svg : undefined;
    return (
      <Box flexDirection="column">
        {Svg && shown.svg ? (
          <Svg source={shown.svg} alt={shown.alt} />
        ) : (
          shown.lines.map((line, i) => <Text key={`line-${i}`}>{line}</Text>)
        )}
      </Box>
    );
  });
};
