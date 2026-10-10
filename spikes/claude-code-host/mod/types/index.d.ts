/** One graph as the pane shows it: the SVG where Graphviz could draw it, and always the same graph as lines of text. */
export type GraphView = { title: string; svg?: string; alt: string; lines: string[]; why?: string }

declare module 'claude-code' {
  interface PluginState {
    'graph-view': { view: GraphView | null }
  }
}
