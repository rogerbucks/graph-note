// Types for graph-spec-check.js, for the TypeScript that uses it (packages/core). Only what the core calls is declared.
// The library itself stays plain JavaScript. These types cover its entry point's API, gathered from the feature modules
// (GUIDE.md). They cover the same API in the built file pages load too.

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
    constructor(line: number, message: string, fix: string, at?: number, code?: string);
    line: number;
    msg: string;
    fix: string;
    /** Where the fix is one insertion: the character on the line it goes before (0-based). */
    at?: number;
    /** The problem's stable code, such as GN101, the same from the Python reader (src/reader/problem-codes.json). */
    code?: string;
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
    /** A block this store applied, with each bare type written with its colon. Each missing comma is written at the
     * end of the code on its line, no line added. It is the text an engine may be given (req:3.engine-gets-commas). */
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

  /** The limits every reader, check and join stops at, each refusal a ProfileError GN601 to GN605 (editor spec §51). */
  const LIMITS: {
    readonly block_chars: number;
    readonly items: number;
    readonly nesting: number;
    readonly join_documents: number;
    readonly join_items: number;
  };
  /** The kinds of secret a text holds, each once and in words, never the text that matched (editor spec §51). */
  function secretsIn(text: string): string[];
  /** [id, kind] for each secret any text value of a graph holds. */
  function secretsInGraph(g: Graph): [string, string][];
  /** A change set's first line (§24 H1): its graph, its id, the state it was made against and its author. Null when it is not one. */
  function changesetHeader(block: string): { graph: string; id: string; against: string; by: string } | null;
  /** A change set checked against its base blocks: each check with whether it passed, its header and the graph's state after it. */
  function checkChangeset(
    base: string[],
    block: string,
    matrix?: unknown,
    switches?: Set<string>,
    /** The author id of the session that sent the set. When given, it is the author, whatever the header names (editor spec §51). */
    session?: string | null,
  ): {
    results: [string, boolean][];
    /** The header, with `refreshes` — each §20 value the change set recomputes: the claim, the key, its value before and after. */
    header:
      | ({ graph: string; id: string; against: string; by: string } & {
          refreshes?: [string, string, Value | null, Value][];
          /** The author the header named, when it was not the session that sent the set. */
          claimed?: string;
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
  /**
   * [text, key] a thing is shown by: its schema's shown_by, a name key, a wording key or its first readable text. Else it
   * is its id, with key null. Text over 80 characters is cut at a word and ends in "…". The shared schema is read only
   * when the graph declares no ElementType of its own.
   */
  function shownText(g: Graph, id: string, shared?: Graph): [string, string | null];
  /** The text each thing of a graph is shown by, as shownText gives it, with the schema read once for them all. */
  function shownTexts(g: Graph, shared?: Graph): (id: string) => [string, string | null];
  /** Text cut to 80 characters at a word, ending in "…"; shorter text as it is. */
  function clipShown(text: string): string;
  /** The readings guessed for a relationship type with none declared: [forward, reverse]. */
  function guessReadings(type: string): [string, string];
  /** The reverse of a forward reading: the active verb of a known passive, the passive of a verb, or a placeholder. */
  function reverseReading(reading: string): string;
  /** The rule a comment after code breaks (§3), and its fix: the same words in the Python library. */
  const COMMENT_RULE: string;
  const COMMENT_FIX: string;
  /** A text quoted as the profile writes it, each control character GQL has an escape for written as that escape. */
  function quote(s: string): string;
  /** A text's tokens: [kind, the text as written, line, the value, column]. Throws ProfileError. */
  function tokens(text: string): [string, string, number, string, number][];
  /** A value as canonical JSON (RFC 8785), a date or time as its text. */
  function jcs(value: unknown): string;
  /** The first sixteen hexadecimal digits of the SHA-256 of an object in canonical JSON (RFC 8785). */
  function hash16(value: unknown): string;
  /** A hash written with its algorithm's name: `sha-256-64:` for 16 digits, `sha-256:` for 64 (editor spec §51). */
  function named(digits: string): string;
  /** Whether a value is a hash that names an algorithm the check knows, with the right number of digits for it. */
  function isNamed(value: unknown): boolean;
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
   * A change set's block split as the check splits it.
   * - `additions` is the block with the statements' lines blanked (every line keeps its number).
   * - `changes` are its DELETE and SET statements. Each has the 1-based line it begins on, the 0-based lines it takes,
   *   its text and the `//@ reason:` hint directly above it.
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
  /** The warnings for proposals whose proposer is named in the old form (ASSOCIATED_WITH on the activity), sorted; each names the fix. */
  function proposerWarnings(world: World, judgementGraph: string): string[];
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

  /** One element's notes and //@ lines (§26, §27). It holds the element's line, the element, and its tags as
   * [key, value] in order. It holds its note's lines ('' for a bare ///) and the note's first paragraph. */
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

  /** A note on a thing or a link (§26; editor spec §24). It holds its element's line, the element and its /// lines'
   * numbers. It holds its text (CommonMark, for the host to render) and its summary, the text's first paragraph. */
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

  /**
   * The group of each of `n` things, found by how they link (the Louvain method), from links as [from, to] by the
   * things' numbers. Groups are numbered from 0 in the order of their first thing. The same links give the same groups.
   */
  function louvain(n: number, links: readonly (readonly [number, number])[]): number[];

  /** A cluster of a graph (editor spec §31): written by a person and asserted, or found by Louvain with a confidence. */
  interface Cluster {
    id: string;
    kind: 'asserted' | 'found';
    members: string[];
    /** The share of the members' links that stay inside. Null for a written cluster. */
    confidence: number | null;
  }
  /** One thing in one cluster. A thing in N clusters has weight 1/N in each. */
  interface ClusterMembership {
    thing: string;
    cluster: string;
    kind: 'asserted' | 'found';
    weight: number;
  }
  /** The clusters of a graph and every membership in them, of one kind when `kind` is given. */
  function clustersOf(
    graph: Graph,
    kind?: 'asserted' | 'found',
  ): { clusters: Cluster[]; memberships: ClusterMembership[] };

  /** What a centroid is worked out from: each member, its weight, its kinds and its likelihood word. */
  type CentroidBasis = [member: string, weight: number, kinds: string[], likelihood: string | null][];
  /** A derived thing that sums up one cluster (editor spec §31). */
  interface Centroid {
    /** A named SHA-256 hash of the cluster's id, so it is the same after a rebuild. */
    id: string;
    cluster: string;
    kind: 'asserted' | 'found';
    members: number;
    weight: number;
    kinds: Record<string, number>;
    certainty: { low: number; high: number } | null;
    /** False while its value may still move. */
    settled: boolean;
    basis: CentroidBasis;
  }
  interface Centroids {
    centroids: Centroid[];
    /** The clusters worked out again, in written order. */
    recomputed: string[];
    passes: number;
    settled: boolean;
  }
  /** The id of a cluster's centroid. */
  function centroidId(cluster: string): string;
  /** Each cluster's centroid. Given the last answer, only what changed is worked out again. */
  function centroidsOf(
    graph: Graph,
    options?: { previous?: Centroids; passes?: number; threshold?: number; budget?: number; clock?: () => number },
  ): Centroids;
  /** Each cycle of clusters inside each other, its clusters in written order. A cycle is flagged, never refused. */
  function clusterCycles(graph: Graph): string[][];
  /** What a view shows with a graph's cycles hidden or highlighted. */
  function cycleView(graph: Graph, how: 'hide' | 'highlight'): { shown: string[]; highlighted: string[] };
  /** How tightly a cluster holds together: links between its members, and how many are contested. */
  interface Cohesion {
    members: number;
    links: number;
    /** The share of the members' pairs a link joins. */
    density: number;
    contested: string[];
    /** The share of members not contested; a member cluster counts its own score. */
    support: number;
    /** The mean of density and support. */
    score: number;
  }
  /** A cluster's certainty as its centroid states it, after cohesion and any floor (editor spec §31). */
  interface ClusterCertainty {
    cluster: string;
    centroid: string;
    certainty: { low: number; high: number } | null;
    cohesion: Cohesion;
    stated: { low: number; high: number } | null;
    /** Whether the cluster opted in to a floor. */
    floor: boolean;
    /** The least certain member that lowered the stated certainty, or null. */
    floored_by: string | null;
  }
  /** Each cluster's cohesion and stated certainty. `floor` names the clusters that opt in to a floor. */
  function clusterCertainty(
    graph: Graph,
    options?: { floor?: string[]; passes?: number; threshold?: number; budget?: number; clock?: () => number },
  ): { clusters: ClusterCertainty[]; settled: boolean };
  /** One thing in the altitude and topic index (editor spec §32). */
  interface AltitudeEntry {
    id: string;
    tags: string[];
    /** Each lens or profile that places it, and the level. */
    altitudes: [string, number][];
    profiles: string[];
    contested: boolean;
    /** Made from its certainty words; null when it has none. */
    sort_key: number | null;
  }
  /** The index of a graph, derived from it, with the hash of its entries. */
  function altitudeIndex(graph: Graph): { entries: AltitudeEntry[]; hash: string };
  /** A search of the index, ranked by certainty sort key, then by how alike, then by id. */
  function searchIndex(
    index: { entries: AltitudeEntry[]; hash: string },
    query?: { topic?: string; like?: string; lens?: string; level?: number; profile?: string },
  ): { id: string; score: number; sort_key: number | null; contested: boolean }[];

  /** The process core's view of a graph (editor spec §34): each thing's kind, what is flagged, and the view settings. */
  interface CoreOfEight {
    kinds: string[];
    kind: Record<string, string>;
    /** Each flag: its code, the thing and a detail. A ninth kind is flagged, never refused. */
    flags: [code: string, id: string, detail: string][];
    view: Record<string, Record<string, unknown>>;
    core: Record<string, Record<string, unknown>>;
  }
  /** A transition: a TRANSITION link, or a Transition thing promoted from one. */
  interface ProcessTransition {
    id: string;
    from: string | null;
    to: string | null;
    promoted: boolean;
    event: unknown;
    /** What it carries that makes it worth promoting: decision, review, comment or do. */
    carries: string[];
  }
  /** A guard as data: an expression, or a function's name and version. */
  interface ProcessGuard {
    id: string;
    expression?: string;
    function?: string;
    version?: string;
    shown: string;
    flag?: string;
  }
  /** One entry of a run's log. */
  interface RunEntry {
    seq: number;
    did: 'entered' | 'left';
    state: string;
    under: string | null;
    at: string | null;
  }
  function coreOfEight(graph: Graph): CoreOfEight;
  function transitionsOf(graph: Graph): ProcessTransition[];
  /** A TRANSITION link promoted to a Transition thing: the link to remove and the graph text to add. */
  function promoteTransition(
    graph: Graph,
    from: string,
    to: string,
    id: string,
  ): { remove: [string, string, string]; lines: string[] };
  /** The shortest path between two things, each transition a step of its own; null when none joins them. */
  function processPath(graph: Graph, from: string, to: string): string[] | null;
  function guardOf(graph: Graph, transition: string): ProcessGuard | null;
  /** Whether a guard holds; a named function runs the version the guard names. */
  function guardAllows(
    guard: ProcessGuard,
    ctx: Record<string, unknown>,
    functions?: Record<string, Record<string, (ctx: Record<string, unknown>) => unknown>>,
  ): boolean;
  function runningRuleOf(
    graph: Graph,
    run: string,
  ): { rule: string | null; from: 'run' | 'process' | 'none'; process_default: string | null };
  function overrideRunningRule(graph: Graph, run: string, rule: string): Graph;
  function runLog(graph: Graph, run: string): RunEntry[];
  function currentOf(graph: Graph, run: string): string[];
  function enterState(graph: Graph, run: string, state: string, at?: string | null): RunEntry[];
  function leaveState(graph: Graph, run: string, state: string, at?: string | null): RunEntry[];
  function moveRun(graph: Graph, run: string, from: string, to: string, at?: string | null): RunEntry[];
  function withEntries(graph: Graph, run: string, entries: RunEntry[]): Graph;
  function refreshCurrent(graph: Graph, run: string): Graph;

  /** A claim as a person ranks it (editor spec §28): its words, never a number typed in. */
  interface MeshClaim {
    id: string;
    likelihood?: unknown;
    likelihood_to?: unknown;
    confidence?: unknown;
    status?: unknown;
  }
  /** A claim ranked by certainty: its range in percent and a sort key, both made from its words. */
  interface RankedClaim {
    id: string;
    status: string;
    likelihood: string;
    likelihood_to: string;
    confidence: string;
    range: [number, number];
    sort_key: number;
  }
  /** A claim's range in percent and its sort key, from its words alone; null without a likelihood word. */
  function certaintyOf(claim: MeshClaim): { range: [number, number]; sort_key: number } | null;
  /** Claims ranked likeliest first: only the shaky ones, or only those at least as likely as a word, when asked. */
  function byCertainty(claims: readonly MeshClaim[], options?: { shaky?: boolean; atLeast?: string }): RankedClaim[];
  /** What the mesh's join found (editor spec §28 and editor spec §30). */
  interface MeshJoin {
    /** Each clash, with each side's value and the documents that state it. */
    conflicts: { subject: string; about: string; sides: [value: unknown, statedIn: string[]][] }[];
    /** What some documents state and others holding the same thing do not. */
    gaps: [
      kind: 'thing' | 'property' | 'relationship',
      subject: string,
      attribute: string,
      has: string[],
      lacks: string[],
    ][];
    claims: RankedClaim[];
    /** The ids of the contested and unlikely claims. */
    shaky: string[];
    /** Each certainty written as a number. */
    flags: [kind: 'numeric-certainty', subject: string, property: string, document: string][];
    /** Each thing's standing: asserted, contested, in doubt from its cluster, or a guessed state match. */
    standing: Record<string, 'asserted' | 'contested' | 'in-doubt' | 'guess'>;
    /** Each link, its own standing, and whether it joins a contested thing to one that is not. */
    links: [link: string, standing: 'asserted' | 'contested', contestedLink: boolean][];
    /** Each hand-made cluster, its standing and the members a join disagrees about. */
    clusters: [cluster: string, standing: 'asserted' | 'contested', disputed: string[]][];
    /** Each state name shared across documents: its things, documents and whether the match is a guess. */
    states: [name: string, things: string[], documents: string[], match: 'guess' | 'confirmed'][];
    /** The joined things' asserted values. */
    nodes: Record<string, Record<string, unknown>>;
  }
  /** Graphs joined as the mesh joins them: the §21 join, then what it found. */
  function meshJoin(q: {
    docs: string[];
    config?: object;
    findings?: { confirms: string; refutes: string[] }[];
    /** Clusters whose doubt passes to their members. */
    spread?: string[];
    /** Pairs of documents the user has said are one domain. */
    sameDomain?: [string, string][];
  }): MeshJoin;

  /** A graph as at a date on one kind of time: when it was recorded, or when it held in the world (editor spec §29). */
  function asAt(graph: Graph, axis: 'recorded' | 'real', date: string): Graph;
  /** A lens run on a graph as at a date: each thing's bucket as it was then, or null for a rule it cannot run. */
  function lensAsAt(graph: Graph, rule: string, axis: 'recorded' | 'real', date: string): Record<string, string> | null;

  /** A value a text merge picked where the join left a dispute: for a person to decide (editor spec §30). */
  interface MergePick {
    subject: string;
    about: string;
    value: unknown;
    /** The claim the picked value matches, and the claims it passed over. */
    claim: string;
    over: string[];
  }
  /** Two edits joined over their base, and their text merge read against that join. */
  function afterTextMerge(q: { base: string; ours: string; theirs: string; merged: string; config?: object }): {
    contested: string[];
    picked: MergePick[];
    /** True only when the join left nothing in dispute. */
    settled: boolean;
  };

  /** A thing named across the world's graphs. */
  interface Placed {
    graph: string;
    key: string;
  }
  /**
   * The things the world's SAME_AS links make one, as sorted `graph/key` names (editor spec §27, ARCH-6). Also the Refs
   * that name nothing, and the names held in two graphs with no link between them, which stay a guess.
   */
  function sameAs(world: World): {
    ones: string[][];
    unresolved: { graph: string; thing: string; ref: string; in: string }[];
    guesses: { name: string; things: string[] }[];
  };
  /** A context's kind and whether it shows same-name guesses with other contexts (editor spec §61). */
  interface ContextInfo {
    kind: 'client' | 'note' | 'folder' | 'vault';
    guessesAcross: boolean;
  }
  /** A world's contexts, the one each graph belongs to, the vault's name and the graph the contexts are written in. */
  interface Contexts {
    contexts: Record<string, ContextInfo>;
    byGraph: Record<string, string>;
    vault: string;
    graph: string;
  }
  /** The contexts of a world: each graph in exactly one, its vault when none claims it (context_named). */
  function contextsOf(
    world: World,
    options?: { graph?: string; notes?: Record<string, string>; vault?: string },
  ): Contexts;
  /** The same-name guesses to show, across contexts only when turned on, and none from a context the viewer cannot read. */
  function contextGuesses(
    world: World,
    ctx: Contexts,
    view?: { acrossContexts?: boolean },
    canRead?: (context: string) => boolean,
  ): { name: string; things: string[]; across: boolean }[];
  /** Whether two `graph/key` things may be compared: one context, one shared schema, or a SAME_AS link. */
  function comparable(world: World, ctx: Contexts, a: string, b: string): boolean;
  /** A proposed SAME_AS link: written, or waiting for a person when it crosses contexts and no person made it. */
  function proposeSameAs(
    ctx: Contexts,
    from: { graph: string; thing: string },
    to: { graph: string; thing: string },
    by: { kind: string; name: string },
  ):
    | { status: 'write'; graph: string; text: string; across: boolean }
    | {
        status: 'waiting';
        for: 'person';
        from: { graph: string; thing: string };
        to: { graph: string; thing: string };
        by: { kind: string; name: string };
      }
    | { status: 'refused'; why: 'not-a-name' };
  /** The SAME_AS links crossing into or out of a context, listed on both sides. */
  function sameAsAcross(
    world: World,
    ctx: Contexts,
    context: string,
  ): { from: string; to: string; contexts: [string, string] }[];
  /** The world one context sees: its own graphs only. */
  function worldIn(world: World, ctx: Contexts, context: string): World;
  /** The `graph/key` things holding a text, from the contexts the viewer can read only. */
  function searchContexts(world: World, ctx: Contexts, text: string, canRead?: (context: string) => boolean): string[];
  /** The type a thing is an instance of, through INSTANCE_OF, here or through a Ref; null when it has none. */
  function typeOf(world: World, graph: string, key: string): Placed | null;
  /** The instances of a type, in every graph, sorted by graph, then key. */
  function instancesOf(world: World, graph: string, key: string): Placed[];
  /** A thing's own properties and those it inherits from its types, the nearest winning; `from` says whose each is. */
  function inherited(
    world: World,
    graph: string,
    key: string,
  ): { props: Record<string, Value>; from: Record<string, string> };

  /** The dialect linter: traps in a GQL text, each with its line. */
  function lint(text: string): { trap: string; line: number }[];
}

export = GraphSpecCheck;
