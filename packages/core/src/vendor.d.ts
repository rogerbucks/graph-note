// Types for the graph library's layout port, which is plain JavaScript loaded unchanged by pages and by Node.
declare module '@graph-note/graph-spec/src/graph-layout.js' {
  type Row = [string, string, string];
  const GraphLayout: {
    /** [source, kinds, readings], as graph_svg.dot_source. */
    dotSource(nodes: Row[], edges: Row[], rankdir: string, style: object): [string, string[], string[]];
    /** A colour per name, chosen from its CRC-32, as graph_svg._pick. */
    pick(names: string[], palette: string[], pinned: Record<string, string>): Record<string, string>;
  };
  export = GraphLayout;
}
