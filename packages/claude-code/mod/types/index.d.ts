// The mod's state: the view the pane draws, kept by /graph. Self-contained, as a contract must be; register.tsx stores
// graph-view.ts's own GraphView in it, so a type check of the mod holds the two alike.

/** One graph as the pane shows it: the SVG where it could be drawn, and always the same graph as lines of text. */
export type GraphView = { title: string; svg?: string; alt: string; lines: string[]; why?: string };

declare module 'claude-code' {
  interface PluginState {
    'graph-note': { view: GraphView | null };
  }
}
