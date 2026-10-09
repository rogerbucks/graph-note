// Types for graph-layout.js, the graph library's port of graph_svg.dot_source, which stays plain JavaScript loaded
// unchanged by pages and by Node.
type Row = [string, string, string];
declare const GraphLayout: {
  /** [source, kinds, readings], as graph_svg.dot_source; `suggested` boxes are dashed and labelled as suggested. */
  dotSource(
    nodes: Row[],
    edges: Row[],
    rankdir: string,
    style: object,
    suggested?: Iterable<string>,
  ): [string, string[], string[]];
  /** A colour per name, chosen from its CRC-32, as graph_svg._pick. */
  pick(names: string[], palette: string[], pinned: Record<string, string>): Record<string, string>;
  /** Python's html.escape(s), quote=True. */
  escape(s: string): string;
};
export = GraphLayout;
