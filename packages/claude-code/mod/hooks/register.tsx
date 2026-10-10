// /graph: draws a graph note's first graph in a pane, with the Graph Note core (spec §10, a Claude Code host). Reading,
// the layout source and theming run here, in the mod's own environment (graph.js); Graphviz runs as a process through
// node (bin/render.mjs), since a mod has no WebAssembly. Where no drawing can be, the pane shows the graph as text with
// the reason: when node is missing, on the terminal (which draws no Svg), and for a graph too large to draw.
import { atom, read, update } from 'claude-code';
import type { EngineInterface, Register } from 'claude-code';

import type { GraphView } from '../types';
import { layOut, notePath, paletteFor, viewOf } from './graph.js';

const PANE = 'graph';
const USAGE = 'Name a note to draw: /graph <path to a note>, quoted if it has spaces.';
const view = atom({ plugin: 'graph-note', key: 'view' } as const, null as GraphView | null);

/** Claude Code's theme setting, so the drawing is painted to match it. */
async function theme($: EngineInterface): Promise<string | undefined> {
  const row = (await $.config.list()).find((r) => r.key === 'theme');
  return typeof row?.value === 'string' ? row.value : undefined;
}

/** The view of the note at `path`, or of why it could not be read. */
async function viewAt($: EngineInterface, path: string): Promise<GraphView> {
  let note: string;
  try {
    note = await $.fs.read(path);
  } catch (err) {
    const why = `Could not read ${path}: ${err instanceof Error ? err.message : String(err)}`;
    return { title: path, alt: why, lines: [why] };
  }
  const run = (argv: readonly string[], stdin: string) => $.process.run(argv, { stdin, timeoutMs: 20000 });
  return viewOf(note, (dots) => layOut(dots, $.plugin.root, run), paletteFor(await theme($)));
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'graph', description: "Draw a graph note's first graph in a pane" });
    return next(e);
  });

  on('command.run', { command: 'graph' }, async ($, e) => {
    const path = notePath(e.args);
    if (!path) return { text: USAGE };
    const shown = await viewAt($, path);
    await update($, view, () => shown);
    await $.ui.open({ id: PANE, title: `Graph: ${shown.title}` });
    return { text: shown.why ? `${shown.alt} — shown as text. ${shown.why}` : shown.alt };
  });

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e);
    const { Box, Text } = elements;
    const shown = await read($, view);
    if (!shown) return <Text dimColor>{USAGE}</Text>;

    // the terminal draws no Svg (Image and Raster only), though `'Svg' in` its table holds: the text stands in there
    const Svg = e.surface !== 'terminal' && 'Svg' in elements ? elements.Svg : undefined;
    if (Svg && shown.svg) return <Svg source={shown.svg} alt={shown.alt} />;
    return (
      <Box flexDirection="column">
        {shown.why ? <Text color="warning">⚠ {shown.why}</Text> : null}
        {shown.lines.map((line, i) => (
          <Text key={`line-${i}`}>{line}</Text>
        ))}
      </Box>
    );
  });
};
