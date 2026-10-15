// Types for graph-spec-check.js, for the TypeScript that uses it (packages/core). Only what the core calls is declared;
// the library itself stays plain JavaScript: its entry point's API, gathered from the feature modules (GUIDE.md), and the
// same API in the built file pages load.

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
    constructor(line: number, message: string, fix: string, at?: number);
    line: number;
    msg: string;
    fix: string;
    /** Where the fix is one insertion: the character on the line it goes before (0-based). */
    at?: number;
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
    /** Where a relationship type written without its colon was read as the graph's one type of that name (§3). */
    bares: { graph: string; line: number; written: string; type: string }[];
    /** Applies one block, and returns the graph it wrote to. Throws ProfileError. */
    apply(block: string): string;
    /** A block this store applied, with each bare type written with its colon and each missing comma written at the
     * end of the code on its line, no line added: the text an engine may be given (req:3.engine-gets-commas). */
    corrected(block: string): string;
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
  /** A graph's canonical text, hashed: the state a change set is made against is its first sixteen digits. */
  function canon(g: Graph): string;

  /** A change set's first line (§24 H1): its graph, its id, the state it was made against and its author; null when it is not one. */
  function changesetHeader(block: string): { graph: string; id: string; against: string; by: string } | null;
  /** A change set checked against its base blocks: each check with whether it passed, its header and the graph's state after it. */
  function checkChangeset(
    base: string[],
    block: string,
    matrix?: unknown,
    switches?: Set<string>,
  ): {
    results: [string, boolean][];
    /** The header, with `refreshes` — each §20 value the change set recomputes: the claim, the key, its value before and after. */
    header:
      | ({ graph: string; id: string; against: string; by: string } & {
          refreshes?: [string, string, Value | null, Value][];
          /** Each DELETE and SET it holds, in order: the id derived from its statement, its kind of change and the `//@ reason:` hint above it. */
          changes?: { id: string; op: string; reason: string | null; links?: [string, string, string][] }[];
        })
      | null;
    after: string | null;
  };
  /** [the shared schema a graph names, that schema's graph if it was loaded]. */
  function schemaFor(world: World, graph: string): [string | undefined, Graph | undefined];
  /** {type: [reading, reverse reading]} from the graph's own schema, else the shared one given. */
  function readings(g: Graph, shared?: Graph): Map<string, [string | undefined, string | undefined]>;
  /** A relationship type in words: its declared reading, else the type's own words. */
  function word(readings: Map<string, [string | undefined, string | undefined]>, type: string): string;
  /** The readings guessed for a relationship type with none declared: [forward, reverse]. */
  function guessReadings(type: string): [string, string];
  /** The reverse of a forward reading: the active verb of a known passive, the passive of a verb, or a placeholder. */
  function reverseReading(reading: string): string;
  /** The rule a comment after code breaks (§3), and its fix: the same words in the Python library. */
  const COMMENT_RULE: string;
  const COMMENT_FIX: string;
  /** A text quoted as the profile writes it, each control character GQL has an escape for written as that escape. */
  function quote(s: string): string;
  /** The first sixteen hexadecimal digits of the SHA-256 of an object in canonical JSON (RFC 8785). */
  function hash16(value: unknown): string;
  /** One statement of a change set, as the check reads it (§24). */
  interface ReadChange {
    op: 'delete-thing' | 'detach-delete-thing' | 'delete-link' | 'set-thing' | 'set-link';
    kind: 'thing' | 'link';
    /** A thing: its id and the kinds the statement names. */
    thing?: string;
    labels?: string[];
    /** A link: its two ends' ids, its type and the kinds named at each end. */
    from?: string;
    type?: string;
    to?: string;
    ends?: string[][];
    /** A SET: the values it gives. */
    set?: Record<string, Value>;
  }
  /**
   * A change set's block split as the check splits it: `additions` is the block with the statements' lines blanked (every
   * line keeps its number), and `changes` are its DELETE and SET statements: the 1-based line each begins on, the
   * 0-based lines it takes, its text and the `//@ reason:` hint directly above it.
   */
  function splitChangeset(block: string): {
    additions: string;
    changes: { line: number; lines: number[]; text: string; reason: string | null }[];
    basisOk: boolean;
  };
  /** One statement read; throws ProfileError unless it is a DELETE or a SET of exactly one target. */
  function readChange(text: string): ReadChange;
  /** The id a statement is given, derived from what it does and never written: the same change has the same id. */
  function changeId(change: ReadChange): string;
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
  function completeness(
    g: Graph,
    today: string,
  ): { rules: CompletenessRule[]; deferred_malformed: { at: string; fix: string }[] };

  /** A data block's shape against the profile, without applying it: the problem, or null. */
  function checkSyntax(block: string): ProfileError | null;

  /** One element's notes and //@ lines (§26, §27): the element's line, the element, its tags as [key, value] in
   * order, its note's lines ('' for a bare ///) and the note's first paragraph. */
  interface OwnedComment {
    line: number;
    element: { thing: string } | { link: [string, string, string] };
    tags: [string, string][];
    note: string[];
    summary: string;
  }
  /** The notes and //@ lines a block's elements own, the comment lines that own nothing, and the //@ lines with no
   * key. Throws ProfileError where the reader does; a query or an excerpt owns nothing. */
  function ownedComments(block: string): { owned: OwnedComment[]; unowned: number[]; malformed: number[] };

  /** A note on a thing or a link (§26; editor spec §24): its element's line, the element, its /// lines' numbers, its
   * text (CommonMark, for the host to render) and its summary, the text's first paragraph. */
  interface ElementNote {
    line: number;
    element: { thing: string } | { link: [string, string, string] };
    lines: number[];
    text: string;
    summary: string;
  }
  /** A block's notes, and each line holding more than one element with a note's /// lines above it, which belongs to
   * none of them. Throws ProfileError where the reader does; a query or an excerpt holds no notes. */
  function notes(block: string): { notes: ElementNote[]; shared: { line: number; lines: number[] }[] };

  /** The dialect linter: traps in a GQL text, each with its line. */
  function lint(text: string): { trap: string; line: number }[];
}

export = GraphSpecCheck;
