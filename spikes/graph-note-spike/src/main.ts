// Throwaway phone spike: Graphviz WebAssembly in Obsidian, timed. Not the plugin.
import { Plugin } from 'obsidian';
import { instance } from '@viz-js/viz';

export default class GraphNoteSpike extends Plugin {
  override onload(): void {
    const t0 = performance.now();
    let startup = 0;
    const engine = instance().then((viz) => { startup = performance.now() - t0; return viz; });
    this.registerMarkdownCodeBlockProcessor('graphviz-spike', async (source, el) => {
      const viz = await engine;
      const t = performance.now();
      const svg = viz.renderSVGElement(source);
      const drawn = performance.now() - t;
      svg.style.maxWidth = '100%';
      svg.style.height = 'auto';
      el.appendChild(svg);
      el.createEl('p', { text: `Graphviz ${viz.graphvizVersion} · engine start ${startup.toFixed(0)} ms · drawn in ${drawn.toFixed(1)} ms` });
    });
  }
}
