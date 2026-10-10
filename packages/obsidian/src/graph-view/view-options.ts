// What a drawn graph is given (spec §3, §4, §14): the reading and the graph, its drawn SVG and its problems, where it is
// shown, what its buttons do, and the editor open in place on its card, if any, which its inspector writes through.
import type { CompletenessReport, Drawn, Indent, Mode, NoteReading, Parked } from '@graph-note/core';
import type { DeclaredList } from '../properties/list-row';
import type { ShownProblem } from './problems-list';
import type { ViewShown } from './view-strip';

/** The editor open in place on this card, as the inspector needs it: the block's text as typed, and a way to replace it. */
export interface Editing {
  session: { text: string } | null;
  replace(text: string): void;
  /** What the details were open on, so the inspector reopens on it in the redrawn card. */
  selected: { key: string } | { link: number } | null;
  /** The lists made while the editor is open, which the inspector shows even before they hold a value. */
  lists?: DeclaredList[];
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
  /** Set when the drawing is a view (spec §7): what it shows, how, and how to write its style. */
  view?: ViewShown;
  /** Writes a view block after the graph's last block in the note (§7, views_by_tapping); resolves to why not, or null. */
  writeView?: (block: string) => Promise<string | null>;
  /** Edit here: opens the text in place, inside this card (spec §4). */
  onEditHere?: () => void;
  /** While the card is edited, its edit button closes the editor, as its Done does (spec §4). */
  onDoneEditing?: () => void;
  /** Tells the card each time an editor in place opens or closes; returns how to stop. */
  watchEditing?: (changed: () => void) => () => void;
  /** Called once the card is built, with the place in it where the editor in place sits. */
  onReady?: (slot: HTMLElement) => void;
  /** A box or a link chosen in the drawing: the editor of its block, if one is open, selects where it is written (§4). */
  onSelect?: (target: { thing: string } | { link: number }) => void;
  /** The editor open in place on this card, if any: then the details are the inspector (spec §14). */
  editing?: () => Editing | undefined;
}
