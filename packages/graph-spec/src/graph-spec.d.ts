// Types for graph-spec-check.js, for the TypeScript that uses it (packages/core). Only what the core calls is declared;
// the library itself stays plain JavaScript, loaded unchanged by pages and by Node.

declare namespace GraphSpecCheck {
  /** A property value as the document profile reads it. */
  type Value = string | number | boolean | null | GTime | Value[];

  class GTime {
    constructor(kind: 'date' | 'datetime', s: string);
    kind: 'date' | 'datetime';
    s: string;
  }

  /** A block that is outside the document profile: its line (1 = the block's first line), what is wrong, and the fix. */
  class ProfileError extends Error {
    constructor(line: number, message: string, fix: string);
    line: number;
    msg: string;
    fix: string;
  }

  type BlockKind = 'data' | 'schema' | 'query' | 'excerpt' | 'changeset';

  /** The graph a block names, and what kind of block it is. Throws ProfileError when there is no usable graph line. */
  function header(block: string): [string | null, BlockKind];

  /** Builds graphs from data blocks, applied in order. */
  class Store {
    graphs: Record<string, unknown>;
    schemas: Record<string, string>;
    named: Record<string, string>;
    /** Where a missing comma between two patterns on separate lines was read as if it were there (§3): the graph, and the line. */
    commas: { graph: string; line: number }[];
    /** Applies one block, and returns the graph it wrote to. Throws ProfileError. */
    apply(block: string): string;
  }

  /** An edge: [source id, type, target id, properties]. */
  type Edge = [string, string, string, Record<string, Value>];

  class Graph {
    /** id -> [labels, properties], in the order the things were written. */
    nodes: Map<string, [Set<string>, Record<string, Value>]>;
    edges: Edge[];
    labelled(label: string): string[];
    p(id: string): Record<string, Value>;
    has(id: string, label: string): boolean;
    out(id: string, type?: string): Edge[];
    inc(id: string, type?: string): Edge[];
  }

  /** Each graph by name; shared schemas and the schema each graph names travel alongside, out of the listing. */
  type World = Record<string, Graph>;

  function worldFromStore(store: Store): World;
  /** [the shared schema a graph names, that schema's graph if it was loaded]. */
  function schemaFor(world: World, graph: string): [string | undefined, Graph | undefined];
  /** {type: [reading, reverse reading]} from the graph's own schema, else the shared one given. */
  function readings(g: Graph, shared?: Graph): Map<string, [string | undefined, string | undefined]>;
  /** A relationship type in words: its declared reading, else the type's own words. */
  function word(readings: Map<string, [string | undefined, string | undefined]>, type: string): string;
  /** The schema's own kinds, left out of drawings. */
  const SCHEMA_LABELS: string[];
  const SPEC_NODES: string[];

  /** The spec's checks on one graph: [what is checked, whether it passed]. */
  function check(world: World, graph: string, matrix?: unknown, switches?: Set<string>): [string, boolean][];

  interface CompletenessRule {
    rule: string;
    kind: 'cardinality' | 'coverage';
    says: string;
    counted: number;
    met: number;
    excused: number;
    missing: { at: string; found: number; fix: string }[];
    deferred: string[];
    overdue: string[];
    malformed: string;
  }
  /** §25: each completeness rule the graph declares, with what is covered, deferred, overdue and missing. */
  function completeness(g: Graph, today: string): { rules: CompletenessRule[]; deferred_malformed: { at: string; fix: string }[] };

  /** The dialect linter: traps in a GQL text, each with its line. */
  function lint(text: string): { trap: string; line: number }[];
}

export = GraphSpecCheck;
