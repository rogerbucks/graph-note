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
  /** The layout source laid out as a diagram type, by its plan (editor spec §15); with no plan, unchanged. */
  typedSource(dot: string, plan: object | undefined, style: object): string;
  /** The one direction a diagram type is laid out in, when nothing else sets one. */
  typeDirection(plan: { type: string }): string;
  /** A colour per name, chosen from its CRC-32, as graph_svg._pick. */
  pick(names: string[], palette: string[], pinned: Record<string, string>): Record<string, string>;
  /** Python's html.escape(s), quote=True. */
  escape(s: string): string;
  /** Python's textwrap.wrap(text, width, break_on_hyphens=False): the lines a box's text is wrapped to. */
  wrap(text: string, width: number): string[];
};
export = GraphLayout;
