// Starting the Graphviz engine (spec §1, §3): Graphviz compiled to WebAssembly, bundled, so drawing needs no network on
// any device. The one module that imports it, so the rest of the core runs where WebAssembly cannot (spec §10).
// A drawing can also be laid out as marks (spec §43, plugin_interface), so a built-in type gives marks as a plug-in
// does. Drawn from its marks, its SVG is the one Graphviz writes (graphviz-svg.ts). The SVG shown is still Graphviz's
// own: reading its layout as JSON costs about twice the work, and the drawing is the same.
import { instance } from '@viz-js/viz';
import { layoutMarks } from './graphviz-marks.ts';
import type { GraphvizLayout } from './graphviz-json.ts';
import type { Engine } from './render.ts';

/** Starts the bundled Graphviz engine. */
export async function loadEngine(): Promise<Engine> {
  const viz = await instance();
  return {
    version: viz.graphvizVersion,
    render: (source) => viz.renderString(source, { format: 'svg' }),
    marks: (source) => layoutMarks(viz.renderJSON(source) as GraphvizLayout),
  };
}
