// What the Export form asks for and how an export went (spec §16), as the display layer sees them. The layer draws the
// form, and the export itself is the host's. The Obsidian plugin writes into the vault; the browser editor will write
// through its server.
import type { DataFormat, ExportFormat, ExportTheme, ViewSpec } from '@thoughtknot/core';

/** What the Export form asks for: the note, the graph or view, whether with its faded context, the format and colours. */
export interface ExportAsk {
  path: string;
  graph: string;
  view?: { name: string; spec: ViewSpec };
  /** A view's faded context: drawn faded in an image, marked as outside the view in the data. */
  context?: boolean;
  format: ExportFormat | DataFormat;
  theme: ExportTheme;
  /** Set once the person has said yes to the question asked. */
  confirmed?: boolean;
  /** A path to play into the image, by its id, at its pace in milliseconds a step: an animated SVG (§7). */
  walk?: { id: string; pace: number };
  /** Aborted when the person stops a long export (§44, progress_shown): then nothing is written. */
  signal?: AbortSignal;
}

/**
 * How an export went: done or stopped (each said in a notice), a question to ask before it goes on, or files ready to
 * share. The share sheet opens those when the person taps Share: a phone allows it only from a tap of their own.
 */
export type ExportOutcome =
  | { done: string }
  | { stopped: string }
  | { ask: string }
  | { share: { name: string; run: () => Promise<ExportOutcome> } };
