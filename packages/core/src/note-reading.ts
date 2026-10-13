// What reading a note's graph blocks gives (spec §3): each graph ready to draw — its boxes, its links, and the estimates
// drawn where what was written was a near miss — and the problems, each with its block, its line and its fix.
import type { World } from '@graph-note/graph-spec';
import type { Estimate } from './estimates.ts';
import type { InlineProperties } from './inline-properties.ts';
import type { Refusal } from './layout-limits.ts';
import type { Nudge } from './style-graph.ts';

/** A gql block in a note: its text, and the note line (1-based) its opening fence is on. */
export interface Block {
  text: string;
  line: number;
}

/**
 * A note on a thing or a link (editor spec §24, note_comment, note_text): the /// lines written directly above it. Its
 * text is CommonMark for the host to render, its summary the text's first paragraph; the block (index in the note) and
 * the /// lines in that block (1 = its graph line) say where it is written.
 */
export interface ThingNote {
  text: string;
  summary: string;
  block: number;
  lines: number[];
}

/** One thing to draw: its id, its kinds joined by a dot, and its text. */
export interface Box {
  key: string;
  kind: string;
  text: string;
  /** Only for a thing with a note written directly above it (editor spec §24). */
  note?: ThingNote;
  /**
   * Only for a thing written without a name, drawn under the name suggested for it (spec §4, unnamed_drawn_suggested):
   * the block it is written in, and the 0-based line and character there, just after its (, where the name would go.
   */
  suggested?: { block: number; line: number; character: number };
  /**
   * Only for a thing some Deferred defers (spec §5, deferred_drawn): what is needed before it is done, and whether every
   * Deferred on it is past its revisit date. The core only says which boxes these are; the host draws the dashing and the
   * later mark on the finished drawing, so the layout source stays byte-identical with the Python library's.
   */
  deferred?: { overdue: boolean; what: string };
}

/** One link to draw, read in its schema's words. */
export interface Link {
  from: string;
  type: string;
  reading: string;
  to: string;
  /** Which written link this is, as an index into its graph's edges, where the drawing holds only some links (a view). */
  edge?: number;
  /** Only for a link with a note written directly above it (editor spec §24). */
  note?: ThingNote;
}

/** One graph, ready to draw: its boxes, its links, and the estimates added where what was written was a near miss. */
export interface GraphDrawing {
  graph: string;
  boxes: Box[];
  /** Every link as written, in order — what graph_svg.py draws. */
  links: Link[];
  /** Near misses drawn as guesses (spec §3): never written to the note. */
  estimates: Estimate[];
  /** The one direction to lay it out in, one the locked style lists (spec §21); unset, the best fit of them all. */
  direction?: string;
  /** The nudges of its style graph (spec §6), written into the layout; none, the layout the Python library gives. */
  nudges?: Nudge[];
  /**
   * The links its style graph draws without their arrowheads (spec §15), by their order in the layout source: its links,
   * then the links guessed from a near miss of a name. None: every arrowhead is drawn.
   */
  arrowless?: number[];
  /** The properties its style graph shows below the text of its boxes and links (spec §14); none, no property shown. */
  inline?: InlineProperties;
}

/** Something that could not be read: its graph, the block (index in the note), the line in that block (1 = its graph line), what is wrong, and the fix. */
export interface Problem {
  graph: string | null;
  block: number;
  line: number;
  message: string;
  fix: string;
  /** An error leaves something out of the drawing; a warning draws it, as an estimate; a hint only offers a fix, and is no problem. */
  severity: 'error' | 'warning' | 'hint';
  /** The text left out of the drawing, when a path or clause was. */
  dropped?: string;
  /** A word to change, and what it could be changed to — one fix each. */
  replace?: { written: string; with: string[] };
  /** Text to add, at a 0-based line and character of the block: the fix, as an edit. */
  insert?: { line: number; character: number; text: string };
  /** What the fix is called where it is offered, when "Change … to …" would not say it. */
  fixTitle?: string;
  /** Exactly where the word to change is: a 0-based line of the block, and the characters it spans on it. */
  span?: { line: number; character: number; end: number };
  /** The name suggested for a thing written without one, which it is drawn under until its fix writes it. */
  suggested?: string;
  /** Further edits made with the `replace` fix, each at a 0-based line and characters of the block, as one change. */
  also?: { span: { line: number; character: number; end: number }; text: string }[];
  /** Set when what was written departs from standard GQL and was read as meant (spec §21): which departure it is. */
  departure?: Departure;
}

/** A departure from standard GQL that the reader reads as meant (spec §21): what strictness acts on. */
export type Departure = 'missing-comma' | 'trailing-comma' | 'bare-type';

/** What a note's graph blocks say: each graph as drawn, the problems, and the graphs themselves, as written and joined. */
export interface NoteReading {
  graphs: Map<string, GraphDrawing>;
  problems: Problem[];
  /** The blocks as written, up to the one drawn. */
  texts: string[];
  /** The world as read, for checks and details. */
  world: World;
  /** The whole note's world, whose schemas lock a graph even when written after the block drawn (§5). */
  whole: World;
  /** Set when the graph blocks were too large to read (§9, layout_contained): nothing was read, and this says why. */
  tooLarge?: Refusal;
}
