// Starting the Graphviz engine (spec §1, §3): Graphviz compiled to WebAssembly, bundled, so drawing needs no network on
// any device. The one module that imports it, so the rest of the core runs where WebAssembly cannot (spec §10).
import { instance } from '@viz-js/viz';
import type { Engine } from './render.ts';

/** Starts the bundled Graphviz engine. */
export async function loadEngine(): Promise<Engine> {
  const viz = await instance();
  return { version: viz.graphvizVersion, render: (source) => viz.renderString(source, { format: 'svg' }) };
}
