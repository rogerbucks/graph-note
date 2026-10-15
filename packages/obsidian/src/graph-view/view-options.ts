// What a drawn graph is given (spec §3, §4, §14): the reading and the graph, its drawn SVG and its problems, where it is
// shown, what its buttons do, and the editor open in place on its card, if any, which its inspector writes through.
import type {
  CompletenessReport,
  Drawn,
  FlowLink,
  FocusDepth,
  Indent,
  Mode,
  NoteReading,
  Parked,
  Refusal,
  ViewState,
} from '@graph-note/core';

/**
 * How the drawing's links move (§7): the links its style graph moves, and the links whose line Graphviz drew from their
 * far end, so something moving along them runs backwards to read forwards.
 */
export interface LinkMotion {
  flow: FlowLink[];
  reversed: number[];
}
import type { DeclaredList } from '../properties/list-row';
import type { ShownProblem } from './problems-list';
import type { ViewShown } from './view-strip';
import type { ProposalCard } from '../proposals/proposal-strip';
import type { DiagramShown } from './type-strip';
import type { Exporting } from '../export/export-form';
import type { LinkHost } from '../links/link-host';
import type { CardImages } from './animated-images';
import type { ViewerAids } from './viewer-aids';

/** What declaring Deferred and DEFERS in the graph's schema gave: the text to park into, and the graph as the note now reads it. */
export interface DeclaredDeferred {
  /** The block as typed, with the declarations when the schema is written in it. */
  text: string;
  whole: NoteReading['whole'][string] | undefined;
}

/** The editor open in place on this card, as the inspector needs it: the block's text as typed, and a way to replace it. */
export interface Editing {
  /**
   * The block as typed, and `current()`: the note as last seen, with what is typed in the block's place, which an edit
   * written into the block is checked against (§4), never the card's drawing, which can be older than the note.
   */
  session: { text: string; current(): NoteReading } | null;
  replace(text: string): void;
  /** Park for later's fix for a graph whose schema lacks Deferred and DEFERS: declares them, wherever the schema is written. Rejects with why not. */
  declareDeferred(): Promise<DeclaredDeferred>;
  /** What the details were open on, so the inspector reopens on it in the redrawn card. */
  selected: { key: string } | { link: number } | null;
  /** The lists made while the editor is open, which the inspector shows even before they hold a value. */
  lists?: DeclaredList[];
}

/** A box, a link or an estimated link chosen in the drawing, as the editor finds where it is written (§3, §4). */
export type Chosen = { thing: string } | { link: number } | { estimate: number };

/**
 * A graph's View menu (§25): the card's switches and the folds opened, and how to lay the graph out again as they now
 * fold it, for the card asking (`owner`, so a newer layout for it replaces one not yet started). It changes the drawing,
 * never the note, so it is open in reading view too.
 */
export interface SwitchesShown {
  state: ViewState;
  relayout: (owner: object) => Promise<Drawn | Refusal | null>;
}

/** What a drawing needs: the reading, the graph, its drawn SVG and problems, where it is shown, and what its buttons do. */
export interface ViewOptions {
  /** The block's text, shown read-only by Source in reading view (spec §3). */
  source?: string;
  reading: NoteReading;
  graph: string;
  drawn: Drawn;
  problems: ShownProblem[];
  mode: Mode;
  /** The note line of a line in a block. */
  lineOf: (at: { block: number; line: number }) => number;
  onEdit: () => void;
  /** In full screen: leaves it. */
  onClose?: () => void;
  /** The completeness report shown behind the badge (spec §8). */
  completeness?: CompletenessReport;
  /** The things parked for later, counted apart from problems behind the badge (spec §8). */
  parked?: Map<string, Parked>;
  /** How the editor indents a thing it writes, as the settings say (spec §21). */
  indent?: Indent;
  /** How many steps along its links focus reaches from a selected thing, as the settings say (§25); one when not given. */
  focusDepth?: FocusDepth;
  /** Whether each note is drawn on the drawing as a callout, as the settings say (§24, note_callouts); off when not given. */
  callouts?: boolean;
  /** The mini-map's setting and whether the details stay open, as the settings say (§24); off and closed when not given. */
  aids?: ViewerAids;
  /** Set when the drawing is a view (spec §7): what it shows, how, and how to write its style. */
  view?: ViewShown;
  /** Set when the drawing is a proposal laid over the graph (spec §17): what it adds, changes and removes, marked, and how a person decides. */
  proposal?: ProposalCard;
  /** The diagram types (spec §15): which fit and why not, the one suggested, the one drawn, and how to choose one. */
  diagram?: DiagramShown;
  /** The View menu's switches (§25); without it, as for a graph drawn as a table, no View menu is offered. */
  switches?: SwitchesShown;
  /** What the drawing can export, and how (§16); without it, no Export is offered. */
  exporting?: Exporting;
  /** How its links move, as its style graph says (§7); none, every link still. */
  motion?: LinkMotion;
  /** Its links followed through Obsidian, and those that name nothing (§18); none, links shown as plain text. */
  links?: LinkHost;
  /** The images its things name, found in the vault, and the boxes a Picture draws one on (§18); none, no image shown. */
  images?: CardImages;
  /** Writes a view block after the graph's last block in the note (§7, views_by_tapping); resolves to why not, or null. */
  writeView?: (block: string) => Promise<string | null>;
  /** Edit here: opens the text in place, inside this card (spec §4); given `at`, with where it is written selected. */
  onEditHere?: (at?: Chosen) => void;
  /** While the card is edited, its edit button closes the editor, as its Done does (spec §4). */
  onDoneEditing?: () => void;
  /** Tells the card each time an editor in place opens or closes; returns how to stop. */
  watchEditing?: (changed: () => void) => () => void;
  /** Called once the card is built, with the place in it where the editor in place sits. */
  onReady?: (slot: HTMLElement) => void;
  /** A box or a link chosen in the drawing: the editor of its block, if one is open, selects where it is written (§4). */
  onSelect?: (target: Chosen) => void;
  /**
   * Writes block `block` of the note (its index) as `now`, only while it is still `was`, as drawn: an estimated link's
   * quick fix (§3) when no editor holds the block. Resolves to why nothing was written, or null.
   */
  writeBlock?: (block: number, was: string, now: string) => Promise<string | null>;
  /** The editor open in place on this card, if any: then the details are the inspector (spec §14). */
  editing?: () => Editing | undefined;
  /** For a card opened from another, as full screen is: read-only whenever the card it was opened from is (spec §3). */
  readOnly?: () => boolean;
}
