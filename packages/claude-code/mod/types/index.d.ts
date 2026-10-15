// The mod's state: the view the pane draws, kept by /graph. Self-contained, as a contract must be; register.tsx stores
// graph-view.ts's own GraphView in it, so a type check of the mod holds the two alike.

/** One graph as the pane shows it: the SVG where it could be drawn, and always the same graph as lines of text. */
export type GraphView = { title: string; svg?: string; alt: string; lines: string[]; why?: string };

declare module 'claude-code' {
  interface PluginState {
    // `editor` counts the changes of the editor pane (a server started, ended or stopped), so it is drawn again. It
    // holds no address, token or note: those never enter state, which the host may keep.
    'graph-note': { view: GraphView | null; editor: number };
  }
}
